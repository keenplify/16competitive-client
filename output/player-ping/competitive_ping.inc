// Team-only ground MDL; icons are drawn once by the managed native HUD.
// Clients without that HUD retain the MDL. No tracking after a ping.
#define PING_CLASS "16c_player_ping"
#define PING_LIFETIME 8.0
#define PING_COOLDOWN 1.0
#define PING_SNAP_RADIUS 48.0

new const PING_MODEL[] = "models/16competitive/ping/v2/ef_gundrop.mdl"
new const PING_ENEMY_MODEL[] = "models/16competitive/ping/v2/ef_gundrop_red.mdl"
new const PING_SOUND[] = "fvox/bell.wav"
new pingModelIndex, pingEnemyModelIndex, pingEnabled, pingMessage
new pingEntities[33], pingTeams[33]
new Float:pingExpires[33], Float:pingNextAllowed[33]
new Float:pingBotNext[33], Float:pingBotTeamNext[3]
new pingBotCursor

#include "competitive_ping_locations.inc"
#include "competitive_ping_transport.inc"

stock ping_precache()
{
    if (file_exists(PING_MODEL)) pingModelIndex = precache_model(PING_MODEL)
    else log_amx("Player Ping: missing %s; pings disabled", PING_MODEL)
    if (file_exists(PING_ENEMY_MODEL)) pingEnemyModelIndex = precache_model(PING_ENEMY_MODEL)
    precache_sound(PING_SOUND)
}

stock ping_init()
{
    pingEnabled = register_cvar("competitive_player_ping", "1")
    pingMessage = engfunc(EngFunc_RegUserMsg, "16CPing", 8)
    register_clcmd("16competitive_ping", "ping_command")
    register_cvar("competitive_bot_reports", "1")
    register_srvcmd("16competitive_bot_report", "ping_bot_report")
    register_forward(FM_Think, "ping_think")
    register_forward(FM_AddToFullPack, "ping_add_to_fullpack", false)
    register_dictionary("16competitive_ping.txt")
    set_task(0.5, "ping_bots", 981, _, _, "b")
}

stock bool:ping_available()
{
    return pingModelIndex > 0 && get_pcvar_num(pingEnabled) > 0 && !is_ffa_deathmatch()
}

stock ping_remove(id)
{
    if (pingEntities[id])
    {
        for (new recipient = 1; recipient <= 32; recipient++)
        {
            if (!is_user_connected(recipient) || is_user_bot(recipient)
                || get_user_team(recipient) != pingTeams[id]) continue
            new Float:zero[3]
            ping_send_message(recipient, id, 255, zero)
        }
    }
    if (pingEntities[id] > 32 && pev_valid(pingEntities[id])) engfunc(EngFunc_RemoveEntity, pingEntities[id])
    pingEntities[id] = pingTeams[id] = 0
    pingExpires[id] = 0.0
}

stock ping_reset_player(id)
{
    ping_remove(id)
    pingNextAllowed[id] = 0.0
    pingBotNext[id] = 0.0
}

stock ping_reset_all()
{
    for (new id = 1; id <= 32; id++) ping_reset_player(id)
    pingBotTeamNext[1] = pingBotTeamNext[2] = 0.0
}

// Class-check before ReAPI members: arbitrary edicts are never cast as weapons.
stock ping_item_weapon(entity)
{
    if (entity <= 32 || !pev_valid(entity)) return 0
    new classname[32]
    pev(entity, pev_classname, classname, charsmax(classname))
    if (equal(classname, "weaponbox"))
    {
        for (new slot = 0; slot < MAX_ITEM_TYPES; slot++)
        {
            new weapon = get_member(entity, m_WeaponBox_rgpPlayerItems, slot)
            if (pev_valid(weapon)) return get_member(weapon, m_iId)
        }
    }
    else if (equal(classname, "grenade") && get_member(entity, m_Grenade_bIsC4))
        return CSW_C4
    else if (equal(classname, "item_thighpack"))
        return 32 // Defuse-kit ping; 31 is reserved for the enemy warning.
    else if (equal(classname, "armoury_entity"))
        return cs_get_armoury_type(entity)
    return 0
}

stock bool:ping_has_line_of_sight(id, const Float:eye[3], const Float:target[3], entity)
{
    new trace = create_tr2()
    engfunc(EngFunc_TraceLine, eye, target, DONT_IGNORE_MONSTERS, id, trace)
    new Float:fraction
    get_tr2(trace, TR_flFraction, fraction)
    new hit = get_tr2(trace, TR_pHit)
    free_tr2(trace)
    return fraction >= 1.0 || hit == entity
}

stock ping_create_entity(id, const Float:origin[3], modelIndex)
{
    new entity = engfunc(EngFunc_CreateNamedEntity, engfunc(EngFunc_AllocString, "info_target"))
    if (entity <= 32 || !pev_valid(entity)) return 0
    set_pev(entity, pev_classname, PING_CLASS)
    set_pev(entity, pev_iuser1, id)
    // Do not use pev_owner: engine owner handling can suppress the sender's marker.
    set_pev(entity, pev_solid, SOLID_NOT)
    set_pev(entity, pev_movetype, MOVETYPE_NONE)
    new modelPath[96]
    if (modelIndex == pingEnemyModelIndex) copy(modelPath, charsmax(modelPath), PING_ENEMY_MODEL)
    else copy(modelPath, charsmax(modelPath), PING_MODEL)
    engfunc(EngFunc_SetModel, entity, modelPath)
    engfunc(EngFunc_SetOrigin, entity, origin)
    set_pev(entity, pev_rendermode, kRenderTransAdd)
    set_pev(entity, pev_renderamt, 255.0)
    set_pev(entity, pev_sequence, 0)
    set_pev(entity, pev_framerate, 1.0)
    set_pev(entity, pev_animtime, get_gametime())
    set_pev(entity, pev_nextthink, get_gametime() + 0.25)
    return entity
}

public ping_command(id)
{
    return ping_at_target(id)
}

// Small angular margin around the live player bounds, evaluated only on a ping.
// At 90-degree FOV this is roughly 20 pixels at 1920px width, capped at 48 units.
stock ping_nearby_enemy(id, const Float:eye[3], const Float:direction[3])
{
    new team = get_user_team(id), bestTarget = 0
    new Float:bestScore = 2.0
    for (new candidate = 1; candidate <= 32; candidate++)
    {
        if (!is_user_alive(candidate) || get_user_team(candidate) == team
            || is_aimbot_detection_probe(candidate)) continue
        new Float:origin[3], Float:mins[3], Float:maxs[3], Float:delta[3], Float:closest[3]
        pev(candidate, pev_origin, origin)
        pev(candidate, pev_mins, mins)
        pev(candidate, pev_maxs, maxs)
        xs_vec_sub(origin, eye, delta)
        new Float:along = xs_vec_dot(delta, direction)
        if (along <= 0.0 || along > 8192.0) continue
        new Float:errorSquared = 0.0
        for (new axis = 0; axis < 3; axis++)
        {
            new Float:aim = eye[axis] + direction[axis] * along
            closest[axis] = floatclamp(aim, origin[axis] + mins[axis], origin[axis] + maxs[axis])
            new Float:miss = aim - closest[axis]
            errorSquared += miss * miss
        }
        new Float:margin = floatclamp(along * 0.022, 4.0, 48.0)
        if (errorSquared > margin * margin) continue
        new Float:score = floatsqroot(errorSquared) / margin + along / 8192.0 * 0.05
        if (score >= bestScore || !ping_has_line_of_sight(id, eye, closest, candidate)) continue
        bestScore = score
        bestTarget = candidate
    }
    return bestTarget
}

// Bot targets are supplied by YaPB's sighting event and validated server-side.
stock ping_at_target(id, botEnemy = 0)
{
    if (!ping_available() || !is_user_alive(id) || is_aimbot_detection_probe(id))
        return PLUGIN_HANDLED
    new team = get_user_team(id)
    if (team != 1 && team != 2) return PLUGIN_HANDLED
    new Float:now = get_gametime()
    if (now < pingNextAllowed[id]) return PLUGIN_HANDLED

    // Trace from the eye, not the feet, to avoid false wall hits.
    new Float:eye[3], Float:offset[3], Float:angles[3], Float:aimDirection[3], Float:end[3], Float:point[3]
    pev(id, pev_origin, eye)
    pev(id, pev_view_ofs, offset)
    xs_vec_add(eye, offset, eye)
    pev(id, pev_v_angle, angles)
    angle_vector(angles, ANGLEVECTOR_FORWARD, aimDirection)
    xs_vec_mul_scalar(aimDirection, 8192.0, end)
    xs_vec_add(eye, end, end)
    new trace, hit = botEnemy, Float:fraction, Float:normal[3]
    if (!botEnemy)
    {
        trace = create_tr2()
        engfunc(EngFunc_TraceLine, eye, end, DONT_IGNORE_MONSTERS, id, trace)
        get_tr2(trace, TR_flFraction, fraction)
        hit = get_tr2(trace, TR_pHit)
        get_tr2(trace, TR_vecEndPos, point)
        get_tr2(trace, TR_vecPlaneNormal, normal)
        free_tr2(trace)
        if (!(hit >= 1 && hit <= 32 && is_user_alive(hit)
            && !is_aimbot_detection_probe(hit) && get_user_team(hit) != team))
        {
            new nearbyEnemy = ping_nearby_enemy(id, eye, aimDirection)
            if (nearbyEnemy) hit = nearbyEnemy
        }
        if (!(hit >= 1 && hit <= 32 && is_user_alive(hit) && get_user_team(hit) != team)
            && (fraction >= 1.0 || engfunc(EngFunc_PointContents, point) == CONTENTS_SKY))
            return PLUGIN_HANDLED
    }

    new weapon = 0, target = 0, bool:enemy = false
    if (hit >= 1 && hit <= 32 && is_user_alive(hit)
        && !is_aimbot_detection_probe(hit) && get_user_team(hit) != team)
    {
        enemy = true
        pev(hit, pev_origin, point)
        pev(hit, pev_mins, offset)
        point[2] += offset[2] + 2.0
    }
    else
    {
        weapon = ping_item_weapon(hit)
        if (weapon > 0) target = hit
        else
        {
            // One bounded sphere search per accepted key press; never per frame.
            new candidate = 0
            new Float:nearest = PING_SNAP_RADIUS, Float:origin[3]
            while ((candidate = engfunc(EngFunc_FindEntityInSphere, candidate, point, PING_SNAP_RADIUS)) > 0)
            {
                new candidateWeapon = ping_item_weapon(candidate)
                if (candidateWeapon <= 0) continue
                pev(candidate, pev_origin, origin)
                new Float:distance = get_distance_f(point, origin)
                if (distance >= nearest || !ping_has_line_of_sight(id, eye, origin, candidate)) continue
                target = candidate
                weapon = candidateWeapon
                nearest = distance
            }
        }
        if (target > 0)
        {
            pev(target, pev_origin, point)
            // Put the ground ring beneath the item, not through its world model.
            new Float:floorStart[3], Float:floorEnd[3]
            xs_vec_copy(point, floorStart)
            floorStart[2] += 4.0
            xs_vec_copy(floorStart, floorEnd)
            floorEnd[2] -= 128.0
            trace = create_tr2()
            engfunc(EngFunc_TraceLine, floorStart, floorEnd, IGNORE_MONSTERS, target, trace)
            get_tr2(trace, TR_flFraction, fraction)
            if (fraction < 1.0) get_tr2(trace, TR_vecEndPos, point)
            free_tr2(trace)
            point[2] += 2.0
        }
        else
        {
            // Offset a location marker out of the contacted surface.
            xs_vec_mul_scalar(normal, 2.0, normal)
            xs_vec_add(point, normal, point)
        }
    }

    ping_remove(id)
    pingTeams[id] = team
    pingEntities[id] = ping_create_entity(id, point,
        enemy && pingEnemyModelIndex ? pingEnemyModelIndex : pingModelIndex)
    if (!pingEntities[id])
    {
        ping_remove(id)
        return PLUGIN_HANDLED
    }
    pingExpires[id] = now + PING_LIFETIME
    pingNextAllowed[id] = now + PING_COOLDOWN
    new playerName[32], location[32], item[32]
    get_user_name(id, playerName, charsmax(playerName))
    ping_location(point, location, charsmax(location))
    if (weapon > 0 && weapon <= 30 && weapon != CSW_C4)
    {
        get_weaponname(weapon, item, charsmax(item))
        replace(item, charsmax(item), "weapon_", "")
        if (weapon == CSW_AK47) copy(item, charsmax(item), "AK-47")
        else strtoupper(item)
    }
    for (new recipient = 1; recipient <= 32; recipient++)
    {
        if (!is_user_connected(recipient) || is_user_bot(recipient) || get_user_team(recipient) != team) continue
        client_cmd(recipient, "spk %s", PING_SOUND)
        // Reliable per-teammate delivery, independent of entity PVS or distance.
        // Enhanced clients draw the image in screen space, including behind walls.
        ping_send_message(recipient, id, enemy ? 31 : weapon, point)
        new message[160], suffix[64]
        if (enemy) formatex(message, charsmax(message), "%L", recipient, "PING_ENEMY", playerName)
        else if (weapon == 32) formatex(message, charsmax(message), "%L", recipient, "PING_KIT", playerName)
        else if (weapon == CSW_C4) formatex(message, charsmax(message), "%L", recipient, "PING_BOMB", playerName)
        else if (weapon == CSW_AK47) formatex(message, charsmax(message), "%L", recipient, "PING_AK47", playerName)
        else if (weapon > 0) formatex(message, charsmax(message), "%L", recipient, "PING_WEAPON", playerName, item)
        else if (location[0]) formatex(message, charsmax(message), "%L", recipient, "PING_LOCATION", playerName, location)
        else formatex(message, charsmax(message), "%L", recipient, "PING_GENERIC", playerName)
        if ((enemy || weapon > 0) && location[0])
        {
            formatex(suffix, charsmax(suffix), " %L", recipient, "PING_AT", location)
            add(message, charsmax(message), suffix)
        }
        client_print_color(recipient, id, "^4[Ping] ^3%s^1.", message)
    }
    return PLUGIN_HANDLED
}

stock bool:ping_bot_sees(id, target)
{
    if (target < 1 || target > 32 || !is_user_alive(target)
        || is_aimbot_detection_probe(target) || get_user_team(target) == get_user_team(id)) return false
    new Float:eye[3], Float:offset[3], Float:point[3], Float:angles[3], Float:viewForward[3], Float:direction[3]
    pev(id, pev_origin, eye)
    pev(id, pev_view_ofs, offset)
    xs_vec_add(eye, offset, eye)
    pev(target, pev_origin, point)
    pev(target, pev_view_ofs, offset)
    xs_vec_add(point, offset, point)
    pev(id, pev_v_angle, angles)
    angle_vector(angles, ANGLEVECTOR_FORWARD, viewForward)
    xs_vec_sub(point, eye, direction)
    xs_vec_normalize(direction, direction)
    if (xs_vec_dot(viewForward, direction) < 0.5) return false
    return ping_has_line_of_sight(id, eye, point, target)
}

public ping_bot_report()
{
    new args[12]
    read_argv(1, args, charsmax(args))
    new id = str_to_num(args)
    read_argv(2, args, charsmax(args))
    new target = str_to_num(args)
    read_argv(3, args, charsmax(args))
    return ping_bot_report_target(id, target, str_to_num(args))
}

stock ping_bot_report_target(id, target, mode)
{
    if (id < 1 || id > 32 || !is_user_connected(id)) return PLUGIN_HANDLED
    if (!ping_available() || !get_cvar_num("competitive_bot_reports")
        || !is_competitive_bot(id) || !is_user_alive(id) || is_aimbot_detection_probe(id)) return PLUGIN_HANDLED
    new team = get_user_team(id)
    new Float:now = get_gametime()
    if ((team != 1 && team != 2) || (mode != 0 && mode != 2)
        || now < pingBotNext[id] || now < pingBotTeamNext[team]
        || !ping_bot_sees(id, target)) return PLUGIN_HANDLED
    new Float:point[3], location[32]
    pev(target, pev_origin, point)
    ping_location(point, location, charsmax(location))
    if (mode == 0 && location[0])
    {
        new count = 1, candidateLocation[32], playerName[32], Float:candidatePoint[3]
        get_user_name(id, playerName, charsmax(playerName))
        for (new candidate = 1; candidate <= 32; candidate++)
        {
            if (candidate == target || !is_user_alive(candidate)
                || get_user_team(candidate) == team || is_aimbot_detection_probe(candidate)) continue
            pev(candidate, pev_origin, candidatePoint)
            if (get_distance_f(point, candidatePoint) > 650.0) continue
            ping_location(candidatePoint, candidateLocation, charsmax(candidateLocation))
            if (equal(location, candidateLocation) && ping_bot_sees(id, candidate)) count++
        }
        strtolower(location)
        if (cvar_exists("yb_comms_debug") && get_cvar_num("yb_comms_debug"))
            log_amx("[Bot Report] bot=%d chat=%d %s", id, count, location)
        // Exact observed count + enemy NAV callout, without inventing a place.
        for (new recipient = 1; recipient <= 32; recipient++)
            if (is_user_connected(recipient) && !is_user_bot(recipient) && get_user_team(recipient) == team)
                client_print_color(recipient, id, "^3%s ^1: %d %s", playerName, count, location)
    }
    else {
        ping_at_target(id, target) // Unknown callout: choose the ping instead.
        if (cvar_exists("yb_comms_debug") && get_cvar_num("yb_comms_debug"))
            log_amx("[Bot Report] bot=%d enemy ping target=%d marker=%d", id, target, pingEntities[id])
    }
    pingBotNext[id] = now + 12.0
    pingBotTeamNext[team] = now + 5.0
    return PLUGIN_HANDLED
}

public ping_bots()
{
    // The coordinated YaPB build selects chat, radio OR ping at its sighting event.
    if (cvar_exists("yb_ping_comms") && get_cvar_num("yb_ping_comms")) return
    if (!ping_available()) return
    new Float:now = get_gametime(), checked = 0
    // At most four engine aim traces per tick, across all bots.
    for (new scanned = 0; scanned < 32 && checked < 4; scanned++)
    {
        pingBotCursor = pingBotCursor % 32 + 1
        new id = pingBotCursor
        if (!is_competitive_bot(id) || !is_user_alive(id) || now < pingBotNext[id]) continue
        new team = get_user_team(id)
        if ((team != 1 && team != 2) || now < pingBotTeamNext[team]) continue
        checked++
        new target, body
        get_user_aiming(id, target, body, 8192)
        if (target < 1 || target > 32 || !is_user_alive(target)
            || is_aimbot_detection_probe(target) || get_user_team(target) == team) continue
        ping_command(id)
        if (pingEntities[id])
        {
            pingBotNext[id] = now + 12.0
            pingBotTeamNext[team] = now + 5.0
        }
    }
}

public ping_think(entity)
{
    if (!pev_valid(entity)) return FMRES_IGNORED
    new owner = pev(entity, pev_iuser1)
    if (owner < 1 || owner > 32 || pingEntities[owner] != entity) return FMRES_IGNORED
    if (!ping_available() || !is_user_alive(owner) || get_user_team(owner) != pingTeams[owner]
        || get_gametime() >= pingExpires[owner])
        ping_remove(owner)
    else
    {
        new Float:brightness = 191.0 + 64.0 * floatcos(get_gametime() * 9.424778)
        set_pev(entity, pev_renderamt, brightness)
        set_pev(entity, pev_nextthink, get_gametime() + 0.05)
    }
    return FMRES_HANDLED
}

public ping_add_to_fullpack(es, e, entity, host, hostFlags, player, pSet)
{
    if (player || !pev_valid(entity)) return FMRES_IGNORED
    new owner = pev(entity, pev_iuser1)
    if (owner < 1 || owner > 32 || pingEntities[owner] != entity)
        return FMRES_IGNORED
    if (!ping_available() || !is_user_alive(owner) || get_gametime() >= pingExpires[owner]
        || get_user_team(owner) != pingTeams[owner] || host < 1 || host > 32
        || !is_user_connected(host) || get_user_team(host) != pingTeams[owner])
    {
        forward_return(FMV_CELL, 0)
        return FMRES_SUPERCEDE
    }
    return FMRES_IGNORED
}
