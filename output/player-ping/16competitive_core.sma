/*
 * 1.6 Competitive server helpers.
 * API reference: https://www.amxmodx.org/api/amxconst
 * Assist approach follows the AlliedModders Damage/DeathMsg pattern:
 * https://forums.alliedmods.net/showthread.php?p=1794194
 */
#include <amxmodx>
#include <amxmisc>
#include <file>
#include <cstrike>
#include <fun>
#include <fakemeta>
#include <hamsandwich>
#include <reapi>
#include <vector>
#include <xs>

#define TASK_AUTO_TEAM 500
#define JOIN_TOKEN_GRACE_SECONDS 10.0
#define TASK_RESPAWN 600
#define TASK_MOTD 700
#define TASK_SKIN_REAPPLY 800
#define TASK_LOCATION_HUD 900
#define TASK_TERMINATION_NOTICE 950
#define TASK_SCOREBOARD_SNAPSHOT 960
#define TASK_BOT_QUOTA 970
#define FIGHT_YARD_DROP_LIFETIME 5.0
#define FIGHT_YARD_ARMOURY_COUNT 9999
#define MAX_TEAM_PLAYERS 10
#define MAX_ROSTER_PLAYERS (MAX_TEAM_PLAYERS * 2)
#define MAX_DAILY_QUESTS 3
#define MAX_RECONNECT_WEAPONS 32
#define MAX_CS_WEAPON_ID 30
#define MAX_CLIENT_SERVER_NAME_LENGTH 31
#define LIVE_RESTART_SECONDS 5
#define LIVE_RESTART_TASK_DELAY 5.1
#define GAME_MODE_COMPETITIVE 0
#define GAME_MODE_DEATHMATCH 1
#define GAME_MODE_FIGHT_YARD 2
#define LEGACY_USE_SLOWDOWN 0.3
#define LEGACY_BHOP_MAX_SPEED_FACTOR 1.7
#define LEGACY_AWP_DEPLOY_DELAY 0.75
#define LEGACY_BOT_HOP_MIN_SPEED_FRACTION 0.7
#define LEGACY_BOT_MIN_RUN_COMMAND_SQUARED 2500.0
#define LEGACY_BOT_CROUCH_RELEASE_DISTANCE 24.0
#define LEGACY_BOT_WALL_LOOKAHEAD 64.0
#define LEGACY_BOT_HOP_COOLDOWN 2.0
#define LEGACY_BOT_MAX_CHAIN_TIME 1.5
#define MAX_FFA_SPAWNS 128
#define FFA_SPAWN_CLEARANCE 250.0
#define FFA_RESPAWN_SECONDS 3
#define FFA_PROTECTION_SECONDS 5.0
#define FFA_PROTECTION_ALPHA 120.0

new ffaSpawnCount
new legacyMovement
new legacyBhopStyle
new legacyAutoBhop
new legacyFallDamage
new bool:legacyPlayerAutoBhop[33]
new legacyWaterJumpTime[33]
new bool:legacyPistolAttackOverride[33]
new legacyPistolFlags[33]
new Float:legacyPistolVelocity[33][3]
new bool:legacyC4AttackOverride[33]
new legacyC4Flags[33]
new bool:legacyBotCrouchHop[33]
new bool:legacyBotBhopEligible[33]
new bool:legacyBotSelectionAssigned[33]
new Float:legacyBotHopDirection[33][3]
new Float:legacyBotHopStartedAt[33]
new Float:legacyBotHopRetryAt[33]
new Float:legacyBotProgressAt[33]
new Float:legacyBotProgressOrigin[33][3]
new Float:ffaSpawnOrigins[MAX_FFA_SPAWNS][3]
new Float:ffaSpawnAngles[MAX_FFA_SPAWNS][3]
new Float:ffaSpawnViewAngles[MAX_FFA_SPAWNS][3]
#define MAX_MATCH_SKINS 64
#define SKIN_DEBUG_BUILD "2026-09-25-b"
#define SKIN_MARKER_UNSKINNED -1
// Content-addressed paths include a UUID and 64-character SHA-256 hash.
#define MAX_SKIN_MODEL_PATH 256
#define MAX_SKIN_SOUND_PATH 256
#define MAX_SKIN_EDICTS 2048
#define MAX_REPORT_DESCRIPTION 191

new const REPORT_REASON_NAMES[][] = {
    "Cheating",
    "Griefing",
    "Toxic communication",
    "AFK / throwing",
    "Other"
}

new const REPORT_REASON_CODES[][] = {
    "CHEATING",
    "GRIEFING",
    "TOXIC_COMMUNICATION",
    "AFK_THROWING",
    "OTHER"
}

new const SKIN_NULL_PLAYER_MODEL[] = "models/16competitive/system/p_null.mdl"

new const FFA_PLAYER_MODELS[][] = {
    "leet",
    "guerilla",
    "arctic",
    "terror",
    "gign",
    "sas",
    "gsg9",
    "urban"
}

new damageByPlayer[33][33]
new playerKills[33]
new playerDeaths[33]
new playerAssists[33]
new playerHeadshots[33]
new playerDamage[33]
new playerGrenadeKills[33]
new roundKills[33]
new roundAssists[33]
new roundDamage[33]
new roundHeadshots[33]
new roundFirstKiller
new playerRosterIndex[33]
new bool:voicePttActive[33]
new Float:roundHudSeen[33]
new bool:teamVoicePttActive[33]
new bool:partyVoicePttActive[33]
new bool:restoreMoneyOnSpawn[33]
new bool:restoreRoundStateOnSpawn[33]
new bool:suppressReconnectRespawn[33]
new bool:ffaProtected[33]
new ffaProtectionFlags[33]
new ffaProtectionRenderMode[33]
new Float:ffaProtectionRenderAmt[33]
new bool:ffaFinished
new bool:ffaMilestone30Announced
new bool:ffaMilestone10Announced
new bool:ffaMilestone3Announced
new ffaPlayerModelIndex[33]
new bool:deathmatchMoneyUpdating[33]
new bool:deathmatchLoadoutValid[33]
new deathmatchActiveWeapon[33]
new deathmatchWeaponCount[33]
new deathmatchWeaponIds[33][MAX_RECONNECT_WEAPONS]
new deathmatchWeaponClips[33][MAX_RECONNECT_WEAPONS]
new deathmatchWeaponSkinMarkers[33][MAX_RECONNECT_WEAPONS]
new deathmatchBpAmmo[33][MAX_CS_WEAPON_ID + 1]
// Highest grenade count acquired during deathmatch. This is the player's
// respawn entitlement, so using a grenade does not permanently consume it.
new deathmatchConsumableCount[33][MAX_CS_WEAPON_ID + 1]
new CsTeams:lockedTeam[33]
new logicalTeam[33]
new rosterNames[MAX_ROSTER_PLAYERS][32]
new rosterTokens[MAX_ROSTER_PLAYERS][65]
new rosterQuestCount[MAX_ROSTER_PLAYERS]
new rosterQuestTitles[MAX_ROSTER_PLAYERS][MAX_DAILY_QUESTS][96]
new rosterQuestProgress[MAX_ROSTER_PLAYERS][MAX_DAILY_QUESTS]
new rosterQuestTargets[MAX_ROSTER_PLAYERS][MAX_DAILY_QUESTS]
new rosterQuestRewards[MAX_ROSTER_PLAYERS][MAX_DAILY_QUESTS]
new bool:rosterQuestCompleted[MAX_ROSTER_PLAYERS][MAX_DAILY_QUESTS]
new rosterIps[MAX_ROSTER_PLAYERS][46]
new rosterTeams[MAX_ROSTER_PLAYERS]
new rosterKills[MAX_ROSTER_PLAYERS]
new rosterDeaths[MAX_ROSTER_PLAYERS]
new rosterAssists[MAX_ROSTER_PLAYERS]
new rosterHeadshots[MAX_ROSTER_PLAYERS]
new rosterDamage[MAX_ROSTER_PLAYERS]
new rosterGrenadeKills[MAX_ROSTER_PLAYERS]
new rosterMoney[MAX_ROSTER_PLAYERS]
new bool:rosterMoneyValid[MAX_ROSTER_PLAYERS]
new bool:rosterRoundStateValid[MAX_ROSTER_PLAYERS]
new bool:rosterWasAlive[MAX_ROSTER_PLAYERS]
new rosterRoundSerial[MAX_ROSTER_PLAYERS]
new rosterHealth[MAX_ROSTER_PLAYERS]
new rosterArmor[MAX_ROSTER_PLAYERS]
new CsArmorType:rosterArmorType[MAX_ROSTER_PLAYERS]
new rosterActiveWeapon[MAX_ROSTER_PLAYERS]
new rosterWeaponCount[MAX_ROSTER_PLAYERS]
new rosterWeaponIds[MAX_ROSTER_PLAYERS][MAX_RECONNECT_WEAPONS]
new rosterWeaponClips[MAX_ROSTER_PLAYERS][MAX_RECONNECT_WEAPONS]
new rosterWeaponSkinMarkers[MAX_ROSTER_PLAYERS][MAX_RECONNECT_WEAPONS]
new rosterBpAmmo[MAX_ROSTER_PLAYERS][MAX_CS_WEAPON_ID + 1]
new rosterCount
new botSlots[3]
new bool:botRosterConfigured
new botAssigned[3]
new botNameCount[3]
new botNames[3][MAX_TEAM_PLAYERS][32]
new botPersonalities[3][MAX_TEAM_PLAYERS][12]
new botCountries[3][MAX_TEAM_PLAYERS][3]
new botChatStyles[3][MAX_TEAM_PLAYERS][12]
new aiBotNames[33][32]
new aiBotPersonalities[33][12]
new aiBotCountries[33][3]
new aiBotChatStyles[33][12]
new bool:matchTerminated
new bool:sidesSwapped
new bool:teamAStartsTerrorist
new logicalScore[3]
new roundsPlayed
new roundWinners[100]
new roundEvents[100]
new currentRoundEvent = 'U'
new roundSerial
new bool:roundEnding
new winTarget = 13
new bool:matchLive
new bool:matchStarting
new Float:assignmentStartedAt[33]
new bool:assignmentPendingLogged[33]
new bool:performingAutoAssignment[33]
new bool:swappingSides
new bool:swapTeamsAtRestart
new teamScoreMessage
new scoreInfoMessage
new serverNameMessage
new showMenuMessage
new vguiMenuMessage
new textMsgMessage
new voiceStatusHudSync
new locationHudSync
new ffaMilestoneHudSync
new locationMessage
new HookChain:killPostHook
new HookChain:writeFullClientUpdateHook
new deathFeedName[32]
new deathFeedKiller
new skinTokens[MAX_MATCH_SKINS][65]
new bool:skinBotPool[MAX_MATCH_SKINS]
new skinPlayerNames[MAX_MATCH_SKINS][32]
new skinWeapons[MAX_MATCH_SKINS][32]
new skinViewModels[MAX_MATCH_SKINS][MAX_SKIN_MODEL_PATH]
new skinPlayerModels[MAX_MATCH_SKINS][MAX_SKIN_MODEL_PATH]
new skinWorldModels[MAX_MATCH_SKINS][MAX_SKIN_MODEL_PATH]
new skinActionSounds[MAX_MATCH_SKINS][MAX_SKIN_SOUND_PATH]
new skinExplosionSprites[MAX_MATCH_SKINS][MAX_SKIN_MODEL_PATH]
new skinExplosionSpriteIndexes[MAX_MATCH_SKINS]
new skinAttackClipBefore[MAX_SKIN_EDICTS + 1]
new grenadeSkinByEntity[MAX_SKIN_EDICTS + 1]
new grenadeOwnerByEntity[MAX_SKIN_EDICTS + 1]
new pendingGrenadeSkinByPlayer[33]
new pendingExplosionGrenade
new pendingExplosionSpriteIndex
new bool:pendingExplosionSpriteConsumed
new skinCount
// One selected manifest skin per weapon type for each bot. Zero means that
// weapon stays unskinned. Weapon-entity markers still take precedence.
new botSkinChoices[33][MAX_MATCH_SKINS]
// GoldSrc does not consistently replicate pev_weaponmodel2 changes to
// observers after a weaponbox transfer. This independent, networked entity
// is the authoritative third-person representation for a skinned weapon.
new skinPlayerModelEntities[33]
new reportTargetRoster[33]
new reportTargetClient[33]
new chatTranslationSequence
new chatTranslationEntry[64]
new chatTranslationRecipients[64][33]
new chatTranslationName[64][32]
new reportReasonIndex[33]
new bool:reportSubmitted[MAX_ROSTER_PLAYERS][MAX_ROSTER_PLAYERS]
new playerLocationName[33][32]

// Team pings share core mode/round lifecycle and work with ordinary GoldSrc clients.
#include "competitive_ping.inc"

public plugin_precache()
{
    ping_precache()
    new file = fopen("competitive_skins.ini", "rt")
    if (!file)
    {
        server_print("[1.6 Competitive][SkinDebug] build=%s manifest=missing", SKIN_DEBUG_BUILD)
        return
    }

    new line[1536], token[65], playerName[32], weapon[32], viewModel[MAX_SKIN_MODEL_PATH]
    new playerModel[MAX_SKIN_MODEL_PATH], worldModel[MAX_SKIN_MODEL_PATH]
    new actionSound[MAX_SKIN_SOUND_PATH], explosionSprite[MAX_SKIN_MODEL_PATH]
    while (!feof(file) && skinCount < MAX_MATCH_SKINS)
    {
        fgets(file, line, charsmax(line))
        trim(line)
        if (!line[0] || (line[0] == '/' && line[1] == '/')) continue
        parse(
            line,
            token, charsmax(token),
            playerName, charsmax(playerName),
            weapon, charsmax(weapon),
            viewModel, charsmax(viewModel),
            playerModel, charsmax(playerModel),
            worldModel, charsmax(worldModel),
            actionSound, charsmax(actionSound),
            explosionSprite, charsmax(explosionSprite)
        )
        if (!token[0] || !weapon[0] || !viewModel[0] || !playerModel[0] || !worldModel[0])
        {
            server_print("[1.6 Competitive][SkinDebug] skipped malformed manifest line")
            continue
        }

        copy(skinTokens[skinCount], charsmax(skinTokens[]), token)
        skinBotPool[skinCount] = equal(token, "BOT_POOL") ? true : false
        copy(skinPlayerNames[skinCount], charsmax(skinPlayerNames[]), playerName)
        copy(skinWeapons[skinCount], charsmax(skinWeapons[]), weapon)
        copy(skinViewModels[skinCount], charsmax(skinViewModels[]), viewModel)
        copy(skinPlayerModels[skinCount], charsmax(skinPlayerModels[]), playerModel)
        copy(skinWorldModels[skinCount], charsmax(skinWorldModels[]), worldModel)

        skinActionSounds[skinCount][0] = 0
        if (actionSound[0] && !equal(actionSound, "-"))
        {
            if (containi(actionSound, "sound/") == 0)
                replace(actionSound, charsmax(actionSound), "sound/", "")
            copy(skinActionSounds[skinCount], charsmax(skinActionSounds[]), actionSound)
            // Custom audio itself is deliberately not precached, which keeps
            // the cosmetic WAV owner-only. Only vanilla fallback copies are
            // registered as shared server resources.
            precache_default_skin_audio(weapon)
        }

        skinExplosionSprites[skinCount][0] = 0
        skinExplosionSpriteIndexes[skinCount] = 0
        if (explosionSprite[0] && !equal(explosionSprite, "-"))
        {
            copy(skinExplosionSprites[skinCount], charsmax(skinExplosionSprites[]), explosionSprite)
            skinExplosionSpriteIndexes[skinCount] = precache_model(skinExplosionSprites[skinCount])
        }

        new viewIndex = precache_model(skinViewModels[skinCount])
        new playerIndex = precache_model(skinPlayerModels[skinCount])
        new worldIndex = precache_model(skinWorldModels[skinCount])
        server_print("[1.6 Competitive] Skin %d precache indices: v=%d p=%d w=%d", skinCount + 1, viewIndex, playerIndex, worldIndex)
        server_print(
            "[1.6 Competitive][SkinDebug] manifest skin=%d player=%s weapon=%s v=%s p=%s w=%s audio=%s sprite=%s",
            skinCount + 1,
            playerName,
            weapon,
            viewModel,
            playerModel,
            worldModel,
            skinActionSounds[skinCount],
            skinExplosionSprites[skinCount]
        )
        skinCount++
    }
    fclose(file)
    if (skinCount > 0)
        precache_model(SKIN_NULL_PLAYER_MODEL)
    server_print("[1.6 Competitive] Loaded %d skin manifest entries", skinCount)
    server_print("[1.6 Competitive][SkinDebug] build=%s skins=%d", SKIN_DEBUG_BUILD, skinCount)
}

stock precache_default_sound(const fileName[])
{
    new fullPath[MAX_SKIN_SOUND_PATH], soundPath[MAX_SKIN_SOUND_PATH]
    formatex(fullPath, charsmax(fullPath), "sound/16competitive/default/%s", fileName)
    if (!file_exists(fullPath)) return

    formatex(soundPath, charsmax(soundPath), "16competitive/default/%s", fileName)
    precache_sound(soundPath)
}

stock precache_default_skin_audio(const weapon[])
{
    if (equal(weapon, "p228")) precache_default_sound("p228-1.wav")
    else if (equal(weapon, "glock18")) precache_default_sound("glock18-1.wav")
    else if (equal(weapon, "usp"))
    {
        precache_default_sound("usp1.wav")
        precache_default_sound("usp_unsil-1.wav")
    }
    else if (equal(weapon, "deagle")) precache_default_sound("deagle-1.wav")
    else if (equal(weapon, "elite")) precache_default_sound("elite_fire.wav")
    else if (equal(weapon, "fiveseven")) precache_default_sound("fiveseven-1.wav")
    else if (equal(weapon, "m3")) precache_default_sound("m3-1.wav")
    else if (equal(weapon, "xm1014")) precache_default_sound("xm1014-1.wav")
    else if (equal(weapon, "mac10")) precache_default_sound("mac10-1.wav")
    else if (equal(weapon, "tmp")) precache_default_sound("tmp-1.wav")
    else if (equal(weapon, "mp5navy")) precache_default_sound("mp5-1.wav")
    else if (equal(weapon, "ump45")) precache_default_sound("ump45-1.wav")
    else if (equal(weapon, "p90")) precache_default_sound("p90-1.wav")
    else if (equal(weapon, "galil")) precache_default_sound("galil-1.wav")
    else if (equal(weapon, "famas")) precache_default_sound("famas-1.wav")
    else if (equal(weapon, "ak47")) precache_default_sound("ak47-1.wav")
    else if (equal(weapon, "m4a1"))
    {
        precache_default_sound("m4a1-1.wav")
        precache_default_sound("m4a1_unsil-1.wav")
    }
    else if (equal(weapon, "scout")) precache_default_sound("scout_fire-1.wav")
    else if (equal(weapon, "sg552")) precache_default_sound("sg552-1.wav")
    else if (equal(weapon, "aug")) precache_default_sound("aug-1.wav")
    else if (equal(weapon, "awp")) precache_default_sound("awp1.wav")
    else if (equal(weapon, "g3sg1")) precache_default_sound("g3sg1-1.wav")
    else if (equal(weapon, "sg550")) precache_default_sound("sg550-1.wav")
    else if (equal(weapon, "m249")) precache_default_sound("m249-1.wav")
    else if (equal(weapon, "knife"))
    {
        precache_default_sound("knife_slash1.wav")
        precache_default_sound("knife_stab.wav")
    }
    else if (equal(weapon, "hegrenade")) precache_default_sound("explode3.wav")
    else if (equal(weapon, "flashbang")) precache_default_sound("flashbang-1.wav")
    else if (equal(weapon, "smokegrenade")) precache_default_sound("sg_explode.wav")
}

// Kept after core globals so the include can access match state.
#include "16competitive_anticheat.inc"

#include "competitive_balance.inc"
#include "competitive_friendly_fire.inc"

public plugin_init()
{
    ac_init()
    ping_init()
    register_plugin("1.6 Competitive Core", "0.1.0", "1.6 Competitive")
    register_cvar("competitive_rounds_to_win", "13")
    // Public, read-only-by-convention score mirrors for local bot integrations.
    // These reflect the current physical T/CT scoreboard after side swaps.
    register_cvar("competitive_score_t", "0")
    register_cvar("competitive_score_ct", "0")
    register_cvar("competitive_score_target", "13")
    register_cvar("competitive_match_id", "unknown")
    register_cvar("competitive_team_a_starts_t", "1")
    register_cvar("competitive_regulation_half_rounds", "12")
    register_cvar("competitive_halftime_enabled", "1")
    register_cvar("competitive_max_rounds", "0")
    register_cvar("competitive_overtime_enabled", "1")
    register_cvar("competitive_overtime_half_rounds", "3")
    register_cvar("competitive_dev_commands", "0")
    register_cvar("competitive_bot_skin_chance", "50")
    register_cvar("competitive_free_armor", "0")
    register_cvar("competitive_free_defuse_kit", "0")
    register_cvar("competitive_location_hud", "1")
    // 0 = normal competitive match with deathmatch warmup.
    // 1 = full-session deathmatch. Kept off by default so existing matches are unchanged.
    register_cvar("competitive_game_mode", "0")
    legacyMovement = register_cvar("competitive_legacy_movement", "0")
    // Bhop Abilities: 0 = auto-hop only, 1 = no slowdown with its 1.7x threshold,
    // 2 = no speed limit. Auto-hop and fall damage are separate controls.
    legacyBhopStyle = register_cvar("competitive_legacy_bhop_style", "0")
    legacyAutoBhop = register_cvar("competitive_legacy_auto_bhop", "0")
    legacyFallDamage = register_cvar("competitive_legacy_fall_damage", "1.0")
    RegisterHam(Ham_Player_Jump, "player", "on_legacy_player_jump", false)
    register_forward(FM_UpdateClientData, "on_legacy_update_client_data")
    register_concmd("amx_autobhop", "on_legacy_admin_autobhop", ADMIN_LEVEL_A,
        "<nick|#userid> <0|1>")
    register_legacy_weapon_hooks()
    register_forward(FM_CmdStart, "on_legacy_bot_cmd_start", false)
    // Operation Points are generated authoritatively by AMXX at match end.
    // Keep these as cvars so progression pacing can be rebalanced without
    // rebuilding the plugin.
    register_cvar("competitive_operation_completion_points", "120")
    register_cvar("competitive_operation_win_points", "80")
    register_cvar("competitive_operation_round_win_points", "12")
    register_cvar("competitive_operation_kill_points", "4")
    register_cvar("competitive_operation_assist_points", "3")
    register_cvar("competitive_operation_headshot_points", "2")
    register_cvar("competitive_operation_damage_per_100_points", "1")
    register_cvar("competitive_operation_performance_cap", "250")
    register_balance_hooks()
    register_friendly_fire_hooks()
    register_logevent("on_round_start", 2, "1=Round_Start")
    register_event("HLTV", "on_new_round", "a", "1=0", "2=0")
    register_event("SendAudio", "on_t_win", "a", "2=%!MRAD_terwin")
    register_event("SendAudio", "on_ct_win", "a", "2=%!MRAD_ctwin")
    RegisterHookChain(RG_RoundEnd, "on_round_end_reason", false)
    register_event("CurWeapon", "on_current_weapon", "be", "1=1")
    register_event("WeapPickup", "on_weapon_pickup", "be")
    teamScoreMessage = get_user_msgid("TeamScore")
    scoreInfoMessage = get_user_msgid("ScoreInfo")
    serverNameMessage = get_user_msgid("ServerName")
    showMenuMessage = get_user_msgid("ShowMenu")
    vguiMenuMessage = get_user_msgid("VGUIMenu")
    textMsgMessage = get_user_msgid("TextMsg")
    locationMessage = get_user_msgid("Location")
    voiceStatusHudSync = CreateHudSyncObj()
    locationHudSync = CreateHudSyncObj()
    ffaMilestoneHudSync = CreateHudSyncObj()
    register_message(teamScoreMessage, "on_team_score_message")
    register_message(showMenuMessage, "on_show_menu")
    register_message(vguiMenuMessage, "on_vgui_menu")
    register_message(textMsgMessage, "on_text_message")
    if (locationMessage > 0)
        register_message(locationMessage, "on_location_message")
    register_message(SVC_TEMPENTITY, "on_skin_temp_entity")
    register_srvcmd("competitive_roster_reset", "roster_reset")
    register_srvcmd("competitive_chat_translation", "deliver_chat_translation")
    register_srvcmd("competitive_roster_player", "roster_player")
    register_srvcmd("competitive_roster_revoke", "roster_revoke")
    register_srvcmd("competitive_roster_bots", "roster_bots")
    register_srvcmd("competitive_roster_bot_name", "roster_bot_name")
    register_srvcmd("competitive_roster_bot_remove", "roster_bot_remove")
    register_srvcmd("competitive_roster_bot_quota", "roster_bot_quota")
    register_srvcmd("competitive_roster_quest", "roster_quest")
    register_clcmd("chooseteam", "block_team_selection")
    register_clcmd("jointeam", "block_team_selection")
    register_clcmd("buy", "block_ffa_buy_menu")
    register_clcmd("buyequip", "block_ffa_buy_menu")
    register_clcmd("buyammo1", "block_ffa_buy_menu")
    register_clcmd("buyammo2", "block_ffa_buy_menu")
    register_clcmd("autobuy", "block_ffa_buy_menu")
    register_clcmd("rebuy", "block_ffa_buy_menu")
    register_clcmd("drop", "block_ffa_weapon_drop")
    register_clcmd("say /killbots", "kill_bots_command")
    // Parse /report from normal chat instead of registering a bare "report"
    // command, which collides with GoldSrc/CS command handling on some clients.
    register_clcmd("say", "chat_command")
    register_clcmd("say_team", "chat_command")
    register_clcmd("16c_report_description", "report_description_command")
    // Custom launcher voice uses its own GoldSrc binds. Do not route through
    // +voicerecord: native GoldSrc voice can otherwise still be sent to HLDS.
    // The legacy command remains mapped to Team talk for older launchers.
    register_clcmd("+16competitive_voice", "on_voice_ptt_down")
    register_clcmd("-16competitive_voice", "on_voice_ptt_up")
    register_clcmd("16competitive_ptt", "on_voice_ptt")
    register_clcmd("+16competitive_team_voice", "on_team_voice_ptt_down")
    register_clcmd("+16competitive_round_hud", "on_round_hud_ready")
    register_clcmd("-16competitive_round_hud", "on_round_hud_unavailable")
    register_clcmd("-16competitive_team_voice", "on_team_voice_ptt_up")
    register_clcmd("+16competitive_party_voice", "on_party_voice_ptt_down")
    register_clcmd("-16competitive_party_voice", "on_party_voice_ptt_up")
    RegisterHam(Ham_TakeDamage, "player", "on_take_damage")
    RegisterHam(Ham_Spawn, "player", "on_spawn", 1)
    RegisterHookChain(RG_CBasePlayer_SetSpawnProtection, "on_ffa_protection_set", true)
    RegisterHookChain(RG_CBasePlayer_RemoveSpawnProtection, "on_ffa_protection_removed", true)
    RegisterHookChain(RG_CSGameRules_RestartRound, "on_restart_round_post", true)
    RegisterHookChain(RG_CSGameRules_CheckWinConditions, "on_ffa_check_win_conditions", false)
    RegisterHookChain(RG_CSGameRules_TeamFull, "on_ffa_team_full", false)
    RegisterHookChain(RG_CSGameRules_TeamStacked, "on_ffa_team_stacked", false)
    RegisterHookChain(RG_CBasePlayer_AddAccount, "on_account_change_post", true)
    RegisterHookChain(RG_CBasePlayer_GiveNamedItem, "on_give_named_item_post", true)
    RegisterHookChain(RG_CBasePlayerWeapon_DefaultDeploy, "on_weapon_deploy_pre", false)
    RegisterHookChain(RG_CBasePlayerWeapon_DefaultDeploy, "on_weapon_deploy_post", true)
    RegisterHookChain(RG_CBasePlayerWeapon_ItemPostFrame, "on_ffa_weapon_frame_post", true)
    RegisterHookChain(RG_CBasePlayer_ThrowGrenade, "on_throw_grenade_pre", false)
    RegisterHookChain(RG_CBasePlayer_ThrowGrenade, "on_throw_grenade_post", true)
    RegisterHookChain(RG_CGrenade_ExplodeHeGrenade, "on_hegrenade_explode", false)
    RegisterHookChain(RG_CGrenade_ExplodeHeGrenade, "on_hegrenade_explode_post", true)
    RegisterHookChain(RG_CGrenade_ExplodeFlashbang, "on_flashbang_explode", false)
    RegisterHookChain(RG_CGrenade_ExplodeFlashbang, "on_flashbang_explode_post", true)
    RegisterHookChain(RG_CGrenade_ExplodeSmokeGrenade, "on_smokegrenade_explode", false)
    RegisterHookChain(RG_CGrenade_ExplodeSmokeGrenade, "on_smokegrenade_explode_post", true)
    register_skin_audio_attack_hooks()
    RegisterHookChain(RG_CBasePlayer_Killed, "on_killed", false)
    RegisterHookChain(RG_CBasePlayer_Killed, "on_ffa_killed_post", true)
    RegisterHookChain(RG_CreateWeaponBox, "on_create_weaponbox_pre", false)
    RegisterHookChain(RG_CWeaponBox_SetModel, "on_weaponbox_set_model", false)
    // Competitive rules ban the tactical shield. ReGameDLL asks this hook before
    // every acquisition path (buying, touching a dropped item, and spawn
    // equipment), which is also what stops bots from buying one.
    RegisterHookChain(RG_CBasePlayer_HasRestrictItem, "on_has_restrict_item_pre", false)
    killPostHook = RegisterHookChain(RG_CBasePlayer_Killed, "on_killed_post", true)
    DisableHookChain(killPostHook)
    writeFullClientUpdateHook = RegisterHookChain(RH_SV_WriteFullClientUpdate, "on_write_full_client_update", false)
    DisableHookChain(writeFullClientUpdateHook)
    register_message(get_user_msgid("DeathMsg"), "on_death_message")
    register_message(get_user_msgid("HideWeapon"), "on_ffa_hide_weapon")
    register_message(get_user_msgid("RoundTime"), "on_ffa_timer")
    register_message(get_user_msgid("ShowTimer"), "on_ffa_timer")
    register_message(get_user_msgid("StatusIcon"), "on_ffa_status_icon")
    set_task(1.0, "report_plugin_ready")
}

public plugin_cfg()
{
    server_cmd("exec competitive_match.cfg")
    server_exec()
    configure_game_mode()
    configure_balance()
    configure_fight_yard_armouries()
    remove_ffa_hostages()
    load_ffa_spawns()
    configure_location_hud()
    ping_load_locations()
    set_task(0.5, "disable_map_timer")
    set_task(0.5, "render_location_hud", TASK_LOCATION_HUD, _, _, "b")
    set_task(0.5, "check_match_termination", TASK_TERMINATION_NOTICE, _, _, "b")
    set_task(0.5, "write_scoreboard_snapshot", TASK_SCOREBOARD_SNAPSHOT, _, _, "b")
    // YaPB reloads its own config during map initialization and can restore
    // a nonzero template quota even after competitive_match.cfg cleared it.
    // Keep both bot controllers tied to the authoritative room roster.
    sync_roster_bot_quota()
    set_task(1.0, "sync_roster_bot_quota", TASK_BOT_QUOTA, _, _, "b")
    refresh_server_name()
}

stock remove_ffa_hostages()
{
    if (!is_full_deathmatch()) return

    new hostage, removed
    while ((hostage = engfunc(EngFunc_FindEntityByString, 0, "classname", "hostage_entity")) > 0)
    {
        engfunc(EngFunc_RemoveEntity, hostage)
        removed++
    }

    if (removed > 0)
        log_amx("FFA: removed %d hostage entities", removed)
}

// Reads the CSDM 2.1 preset format, without requiring its native module:
// origin XYZ, model angles XYZ, ignored team, view angles XYZ.
// Older bundled files have only origin XYZ and angles XYZ.
stock bool:valid_spawn_number(const value[])
{
    new index, digits, dots
    if (value[0] == '-' || value[0] == '+') index++
    for (; value[index]; index++)
    {
        if (value[index] >= '0' && value[index] <= '9') digits++
        else if (value[index] == '.' && ++dots == 1) continue
        else return false
    }
    return digits > 0
}

stock load_ffa_spawns()
{
    ffaSpawnCount = 0
    if (!is_full_deathmatch()) return
    new configs[128], mapName[64], path[256]
    get_configsdir(configs, charsmax(configs))
    get_mapname(mapName, charsmax(mapName))
    formatex(path, charsmax(path), "%s/csdm/%s.spawns.cfg", configs, mapName)
    new file = fopen(path, "rt")
    if (!file)
    {
        log_amx("FFA: no spawn preset for %s; using map spawns", mapName)
        return
    }
    new line[512], fields[10][24], rejected
    new Float:values[10]
    while (!feof(file) && ffaSpawnCount < MAX_FFA_SPAWNS)
    {
        fgets(file, line, charsmax(line))
        trim(line)
        if (!line[0] || line[0] == ';' || line[0] == '#' || line[0] == '[' || equal(line, "//", 2)) continue
        new fieldCount = parse(line, fields[0], 23, fields[1], 23, fields[2], 23,
            fields[3], 23, fields[4], 23, fields[5], 23, fields[6], 23,
            fields[7], 23, fields[8], 23, fields[9], 23)
        if (fieldCount != 10 && fieldCount != 6)
        {
            rejected++
            continue
        }
        new bool:valid = true
        for (new field = 0; field < fieldCount; field++)
        {
            if (!valid_spawn_number(fields[field])) { valid = false; break; }
            values[field] = str_to_float(fields[field])
            if (floatabs(values[field]) > (field < 3 ? 32768.0 : 360.0)) { valid = false; break; }
        }
        if (!valid) { rejected++; continue; }
        for (new axis = 0; axis < 3; axis++)
        {
            ffaSpawnOrigins[ffaSpawnCount][axis] = values[axis]
            ffaSpawnAngles[ffaSpawnCount][axis] = values[axis + 3]
            ffaSpawnViewAngles[ffaSpawnCount][axis] = values[axis + (fieldCount == 10 ? 7 : 3)]
        }
        ffaSpawnCount++
    }
    fclose(file)
    log_amx("FFA: loaded %d spawn presets for %s (%d rejected)", ffaSpawnCount, mapName, rejected)
}

stock place_ffa_spawn(id)
{
    if (!is_full_deathmatch() || !ffaSpawnCount || !is_user_alive(id)) return
    if (matchTerminated || ffaFinished || is_user_hltv(id) || is_aimbot_detection_probe(id)) return
    if (logicalTeam[id] != 1 && logicalTeam[id] != 2) return

    // Cache living player positions once per spawn. No per-frame scans or I/O.
    new Float:positions[32][3], count
    for (new player = 1; player <= 32; player++)
    {
        if (player == id || !is_user_alive(player)) continue
        pev(player, pev_origin, positions[count++])
    }
    new order[MAX_FFA_SPAWNS]
    for (new index = 0; index < ffaSpawnCount; index++) order[index] = index
    new trace = create_tr2()
    for (new index = 0; index < ffaSpawnCount; index++)
    {
        // Partial Fisher-Yates visits every candidate at most once.
        new pick = random_num(index, ffaSpawnCount - 1)
        new spawn = order[pick]
        order[pick] = order[index]
        new bool:clear = true
        for (new player = 0; player < count; player++)
        {
            if (get_distance_f(ffaSpawnOrigins[spawn], positions[player]) < FFA_SPAWN_CLEARANCE)
            { clear = false; break; }
        }
        if (!clear) continue
        engfunc(EngFunc_TraceHull, ffaSpawnOrigins[spawn], ffaSpawnOrigins[spawn],
            DONT_IGNORE_MONSTERS, HULL_HUMAN, id, trace)
        if (get_tr2(trace, TR_StartSolid) || get_tr2(trace, TR_AllSolid) || !get_tr2(trace, TR_InOpen)) continue
        engfunc(EngFunc_SetOrigin, id, ffaSpawnOrigins[spawn])
        set_pev(id, pev_angles, ffaSpawnAngles[spawn])
        set_pev(id, pev_v_angle, ffaSpawnViewAngles[spawn])
        set_pev(id, pev_fixangle, 1)
        new Float:stopped[3]
        set_pev(id, pev_velocity, stopped)
        break
    }
    free_tr2(trace)
    // If every candidate is blocked or crowded, retain the engine's spawn.
}

stock configure_location_hud()
{
    // ReGameDLL performs the NAV lookup in full 3D and keeps m_lastLocation
    // current when mp_location_area_info is enabled. Old CS 1.6 clients do
    // not reliably render the native Location user message, so AMXX draws a
    // compatible HUD label while reusing ReGameDLL's authoritative result.
    if (cvar_exists("mp_location_area_info"))
        set_cvar_num("mp_location_area_info", 1)
    else
        server_print("[1.6 Competitive] mp_location_area_info is unavailable; NAV callouts are disabled")
}

stock configure_game_mode()
{
    if (!is_full_deathmatch()) return

    // Native free-for-all is enabled only for FFA. Fight Yard deliberately
    // keeps ReGameDLL's real T/CT team relationships while sharing the same
    // continuous-respawn deathmatch machinery.
    if (is_ffa_deathmatch() && !cvar_exists("mp_freeforall"))
    {
        set_fail_state("FFA requires ReGameDLL with mp_freeforall support")
        return
    }
    if (cvar_exists("mp_freeforall"))
        set_cvar_num("mp_freeforall", is_ffa_deathmatch() ? 1 : 0)
    set_cvar_num("mp_autokick", 0)
    set_cvar_num("mp_tkpunish", 0)
    set_cvar_num("mp_give_player_c4", 0)
    set_cvar_num("mp_forcerespawn", 0) // Core owns the delayed respawn.
    if (is_ffa_deathmatch())
        set_member_game(m_iLimitTeams, 0)
    set_cvar_float("mp_respawn_immunitytime", FFA_PROTECTION_SECONDS)
    set_cvar_num("mp_respawn_immunity_effects", 0)
    set_cvar_num("mp_respawn_immunity_force_unset", 2)

    // Deathmatch modes do not end on map objectives or engine rounds.
    server_cmd("mp_round_infinite 1")
    server_cmd("mp_roundtime 0")
    server_cmd("mp_freezetime 0")
    set_member_game(m_iRoundTime, 0)
    set_member_game(m_iRoundTimeSecs, 0)
    if (is_fight_yard())
    {
        server_cmd("mp_buy_anywhere 0")
        server_cmd("mp_buytime 0")
        server_cmd("mp_weapondrop 1")
    }
    else
    {
        server_cmd("mp_buy_anywhere 1")
        server_cmd("mp_buytime 9999")
        server_cmd("mp_weapondrop 0")
    }
    server_cmd("mp_nadedrops 0")
    server_exec()
}

stock configure_fight_yard_armouries()
{
    if (!is_fight_yard()) return

    new entity = -1
    while ((entity = engfunc(EngFunc_FindEntityByString, entity, "classname", "armoury_entity")) > 0)
    {
        set_member(entity, m_Armoury_iCount, FIGHT_YARD_ARMOURY_COUNT)
        set_member(entity, m_Armoury_iInitialCount, FIGHT_YARD_ARMOURY_COUNT)
    }
}

public on_create_weaponbox_pre(weaponent, owner, const modelName[], Float:origin[3], Float:angles[3], Float:velocity[3], Float:lifeTime, bool:packAmmo)
{
    if (!is_fight_yard()) return
    SetHookChainArg(7, ATYPE_FLOAT, FIGHT_YARD_DROP_LIFETIME)
}

public CS_OnBuyAttempt(id, itemid)
{
    return is_fight_yard() ? PLUGIN_HANDLED : PLUGIN_CONTINUE
}

public on_ffa_check_win_conditions()
{
    if (!is_full_deathmatch()) return

    // ReGameDLL checks this cvar when a player dies. Keep it enabled even if
    // a later server config changes it, so the last CT death cannot end FFA.
    if (get_cvar_num("mp_round_infinite") != 1)
        set_cvar_num("mp_round_infinite", 1)
}

public on_ffa_team_full(TeamName:team)
{
    // FFA uses its own spawn placement, so map T/CT spawn counts must not
    // prevent a player from choosing either side for the weapon shop.
    if (!is_ffa_deathmatch() || (team != TEAM_TERRORIST && team != TEAM_CT))
        return HC_CONTINUE

    SetHookChainReturn(ATYPE_INTEGER, false)
    return HC_SUPERCEDE
}

public on_ffa_team_stacked(newTeam, currentTeam)
{
    // FFA physical sides select a weapon shop, not a balanced scoring team.
    if (!is_ffa_deathmatch()) return HC_CONTINUE

    SetHookChainReturn(ATYPE_INTEGER, false)
    return HC_SUPERCEDE
}

public disable_map_timer()
{
    server_cmd("mp_timelimit 0")
    server_cmd("mp_maxrounds 0")
    server_cmd("mp_winlimit 0")
    server_exec()
}

public report_plugin_ready()
{
    write_event_number("plugin_ready", get_cvar_num("competitive_rounds_to_win"))
}

public client_putinserver(id)
{
    roundHudSeen[id] = 0.0
    if (roundFirstKiller == id) roundFirstKiller = 0
    roundKills[id] = 0
    roundAssists[id] = 0
    roundDamage[id] = 0
    roundHeadshots[id] = 0
    legacyPlayerAutoBhop[id] = false
    legacyWaterJumpTime[id] = 0
    legacyBotCrouchHop[id] = false
    legacyBotBhopEligible[id] = false
    legacyBotSelectionAssigned[id] = false
    legacyBotHopRetryAt[id] = 0.0
    legacyBotProgressAt[id] = 0.0
    aiBotNames[id][0] = 0
    write_ai_bot_identity_map()
    ffaProtected[id] = false
    ffaPlayerModelIndex[id] = -1
    ac_reset(id)
    clear_damage(id)
    playerLocationName[id][0] = 0
    playerKills[id] = 0
    playerDeaths[id] = 0
    playerAssists[id] = 0
    playerHeadshots[id] = 0
    playerDamage[id] = 0
    playerGrenadeKills[id] = 0
    playerRosterIndex[id] = 0
    voicePttActive[id] = false
    teamVoicePttActive[id] = false
    partyVoicePttActive[id] = false
    restoreMoneyOnSpawn[id] = false
    restoreRoundStateOnSpawn[id] = false
    suppressReconnectRespawn[id] = false
    deathmatchMoneyUpdating[id] = false
    deathmatchLoadoutValid[id] = false
    deathmatchActiveWeapon[id] = 0
    deathmatchWeaponCount[id] = 0
    clear_deathmatch_consumable_entitlements(id)
    lockedTeam[id] = CS_TEAM_UNASSIGNED
    logicalTeam[id] = 0
    if (is_ffa_deathmatch())
        ffaPlayerModelIndex[id] = random_num(0, sizeof(FFA_PLAYER_MODELS) - 1)
    assignmentStartedAt[id] = get_gametime()
    assignmentPendingLogged[id] = false
    for (new index = 0; index < MAX_MATCH_SKINS; index++)
        botSkinChoices[id][index] = 0
    pendingGrenadeSkinByPlayer[id] = 0
    reportTargetRoster[id] = -1
    reportTargetClient[id] = 0
    reportReasonIndex[id] = -1
    // HLTV is the match evidence recorder, not a roster player. On localhost
    // its address can match the only human player's fallback IP; scheduling
    // roster assignment would rename HLTV and leave a duplicate spectator.
    if (is_user_hltv(id) || is_aimbot_detection_probe(id)) return
    if (is_competitive_bot(id) && skinCount > 0)
        assign_bot_skins(id)
    create_skin_player_model_entity(id)
    skin_debug_player(id, "connected")
    if (skin_debug_enabled() && is_competitive_bot(id))
    {
        for (new index = 0; index < skinCount; index++)
            if (botSkinChoices[id][index])
                server_print("[1.6 Competitive][SkinDebug] bot skin choice player=%d weapon=%s choice=%d", id, skinWeapons[index], botSkinChoices[id][index])
    }
    set_task(0.5, "auto_assign_team", TASK_AUTO_TEAM + id)
    set_task(1.5, "show_match_motd", TASK_MOTD + id)
}

public client_disconnected(id, bool:drop, message[], maxlen)
{
    ping_reset_player(id)
    legacyPlayerAutoBhop[id] = false
    legacyWaterJumpTime[id] = 0
    legacyBotCrouchHop[id] = false
    legacyBotBhopEligible[id] = false
    legacyBotSelectionAssigned[id] = false
    legacyBotHopRetryAt[id] = 0.0
    legacyBotProgressAt[id] = 0.0
    if (aiBotNames[id][0])
    {
        aiBotNames[id][0] = 0
        write_ai_bot_identity_map()
    }
    ac_reset(id)
    if (is_user_hltv(id) || is_aimbot_detection_probe(id)) return

    new name[32]
    get_user_name(id, name, charsmax(name))
    // Send live totals before the backend removes this slot mapping. The final
    // result may arrive after this player has left, in any match mode.
    if ((matchLive || swappingSides) && logicalTeam[id] >= 1 && logicalTeam[id] <= 2)
        write_player_stats(id, 0, 0, false)
    write_event("player_disconnected", id, name)
    if (teamVoicePttActive[id]) write_voice_ptt_event(id, false, "team")
    if (partyVoicePttActive[id]) write_voice_ptt_event(id, false, "party")
    if (voicePttActive[id]) render_voice_ptt_chatter_icon(id, false, true)
    voicePttActive[id] = false
    teamVoicePttActive[id] = false
    partyVoicePttActive[id] = false
    playerLocationName[id][0] = 0
    if (!is_competitive_bot(id) && (matchLive || swappingSides))
        save_player_state(id)
    clear_damage(id)
    if (is_competitive_bot(id) && logicalTeam[id] >= 1 && logicalTeam[id] <= 2 && botAssigned[logicalTeam[id]] > 0)
        botAssigned[logicalTeam[id]]--
    lockedTeam[id] = CS_TEAM_UNASSIGNED
    logicalTeam[id] = 0
    ffaPlayerModelIndex[id] = -1
    playerRosterIndex[id] = 0
    restoreMoneyOnSpawn[id] = false
    restoreRoundStateOnSpawn[id] = false
    suppressReconnectRespawn[id] = false
    deathmatchMoneyUpdating[id] = false
    deathmatchLoadoutValid[id] = false
    deathmatchActiveWeapon[id] = 0
    deathmatchWeaponCount[id] = 0
    clear_deathmatch_consumable_entitlements(id)
    assignmentStartedAt[id] = 0.0
    assignmentPendingLogged[id] = false
    for (new index = 0; index < MAX_MATCH_SKINS; index++)
        botSkinChoices[id][index] = 0
    pendingGrenadeSkinByPlayer[id] = 0
    performingAutoAssignment[id] = false
    reportTargetRoster[id] = -1
    reportTargetClient[id] = 0
    reportReasonIndex[id] = -1
    remove_task(TASK_AUTO_TEAM + id)
    remove_task(TASK_RESPAWN + id)
    remove_task(TASK_MOTD + id)
    remove_task(TASK_SKIN_REAPPLY + id)
    remove_skin_player_model_entity(id)
}

stock register_skin_audio_attack_hooks()
{
    new const weaponClasses[][] = {
        "weapon_p228", "weapon_glock18", "weapon_usp", "weapon_deagle",
        "weapon_elite", "weapon_fiveseven", "weapon_m3", "weapon_xm1014",
        "weapon_mac10", "weapon_tmp", "weapon_mp5navy", "weapon_ump45",
        "weapon_p90", "weapon_galil", "weapon_famas", "weapon_ak47",
        "weapon_m4a1", "weapon_scout", "weapon_sg552", "weapon_aug",
        "weapon_awp", "weapon_g3sg1", "weapon_sg550", "weapon_m249",
        "weapon_knife"
    }

    for (new i = 0; i < sizeof weaponClasses; i++)
    {
        RegisterHam(Ham_Weapon_PrimaryAttack, weaponClasses[i], "on_skin_primary_attack_pre", false)
        RegisterHam(Ham_Weapon_PrimaryAttack, weaponClasses[i], "on_skin_primary_attack_post", true)
    }

    RegisterHam(Ham_Weapon_SecondaryAttack, "weapon_knife", "on_skin_knife_secondary_post", true)
}

public on_skin_primary_attack_pre(item)
{
    if (item <= 0 || item > MAX_SKIN_EDICTS) return HAM_IGNORED
    skinAttackClipBefore[item] = get_member(item, m_Weapon_iClip)
    return HAM_IGNORED
}

public on_skin_primary_attack_post(item)
{
    if (item <= 0 || item > MAX_SKIN_EDICTS) return HAM_IGNORED

    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return HAM_IGNORED

    new className[32], weapon[32]
    pev(item, pev_classname, className, charsmax(className))
    copy(weapon, charsmax(weapon), className)
    replace(weapon, charsmax(weapon), "weapon_", "")

    if (!equal(weapon, "knife"))
    {
        new clipAfter = get_member(item, m_Weapon_iClip)
        if (skinAttackClipBefore[item] <= clipAfter) return HAM_IGNORED
    }

    play_skin_action_audio(id, weapon, item, false)
    return HAM_IGNORED
}

public on_skin_knife_secondary_post(item)
{
    if (item <= 0 || item > MAX_SKIN_EDICTS) return HAM_IGNORED
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return HAM_IGNORED
    play_skin_action_audio(id, "knife", item, true)
    return HAM_IGNORED
}

stock resolve_weapon_entity_skin(id, item, const weapon[])
{
    if (item > 0)
    {
        new marker = pev(item, pev_iuser4)
        if (marker > 0)
        {
            new skin = marker - 1
            if (skin >= 0 && skin < skinCount) return skin
        }
        if (marker == SKIN_MARKER_UNSKINNED) return -1
    }
    return find_player_weapon_skin(id, weapon)
}

stock play_skin_action_audio(shooter, const weapon[], item, bool:secondary)
{
    new actualSkin = resolve_weapon_entity_skin(shooter, item, weapon)

    for (new listener = 1; listener <= 32; listener++)
    {
        if (!is_user_connected(listener) || is_user_bot(listener)) continue

        // This is the listener's account-equipped skin. It tells us whether
        // their launcher muted the stock local WAV for this weapon.
        new listenerSkin = find_player_weapon_skin(listener, weapon)
        if (
            listenerSkin < 0 ||
            listenerSkin >= skinCount ||
            !skinActionSounds[listenerSkin][0]
        ) {
            continue
        }

        if (
            listener == shooter &&
            actualSkin == listenerSkin &&
            skinActionSounds[actualSkin][0]
        ) {
            client_cmd(
                listener,
                "spk ^"%s^"",
                skinActionSounds[actualSkin]
            )
            continue
        }

        // The listener's stock WAV is locally silent, but this action is not
        // their own equipped custom-audio skin. Send only this listener a
        // spatial vanilla copy so pickups and other players remain normal.
        new defaultSound[MAX_SKIN_SOUND_PATH]
        if (get_default_action_sound(weapon, item, secondary, defaultSound, charsmax(defaultSound)))
            rh_emit_sound2(
                shooter,
                listener,
                CHAN_WEAPON,
                defaultSound,
                VOL_NORM,
                ATTN_NORM,
                0,
                PITCH_NORM
            )
    }
}

stock bool:get_default_action_sound(
    const weapon[],
    item,
    bool:secondary,
    output[],
    outputLength
)
{
    if (equal(weapon, "p228")) copy(output, outputLength, "16competitive/default/p228-1.wav")
    else if (equal(weapon, "glock18")) copy(output, outputLength, "16competitive/default/glock18-1.wav")
    else if (equal(weapon, "usp"))
    {
        new weaponState = item > 0 ? get_member(item, m_Weapon_iWeaponState) : 0
        // ReAPI's get_member() returns an untagged int while the WPNSTATE_*
        // constants come from cssdk_const.inc's "WeaponState" enum. Untag the
        // constant so the mask cannot produce a tag mismatch warning.
        copy(
            output,
            outputLength,
            (weaponState & _:WPNSTATE_USP_SILENCED)
                ? "16competitive/default/usp1.wav"
                : "16competitive/default/usp_unsil-1.wav"
        )
    }
    else if (equal(weapon, "deagle")) copy(output, outputLength, "16competitive/default/deagle-1.wav")
    else if (equal(weapon, "elite")) copy(output, outputLength, "16competitive/default/elite_fire.wav")
    else if (equal(weapon, "fiveseven")) copy(output, outputLength, "16competitive/default/fiveseven-1.wav")
    else if (equal(weapon, "m3")) copy(output, outputLength, "16competitive/default/m3-1.wav")
    else if (equal(weapon, "xm1014")) copy(output, outputLength, "16competitive/default/xm1014-1.wav")
    else if (equal(weapon, "mac10")) copy(output, outputLength, "16competitive/default/mac10-1.wav")
    else if (equal(weapon, "tmp")) copy(output, outputLength, "16competitive/default/tmp-1.wav")
    else if (equal(weapon, "mp5navy")) copy(output, outputLength, "16competitive/default/mp5-1.wav")
    else if (equal(weapon, "ump45")) copy(output, outputLength, "16competitive/default/ump45-1.wav")
    else if (equal(weapon, "p90")) copy(output, outputLength, "16competitive/default/p90-1.wav")
    else if (equal(weapon, "galil")) copy(output, outputLength, "16competitive/default/galil-1.wav")
    else if (equal(weapon, "famas")) copy(output, outputLength, "16competitive/default/famas-1.wav")
    else if (equal(weapon, "ak47")) copy(output, outputLength, "16competitive/default/ak47-1.wav")
    else if (equal(weapon, "m4a1"))
    {
        new weaponState = item > 0 ? get_member(item, m_Weapon_iWeaponState) : 0
        copy(
            output,
            outputLength,
            (weaponState & _:WPNSTATE_M4A1_SILENCED)
                ? "16competitive/default/m4a1-1.wav"
                : "16competitive/default/m4a1_unsil-1.wav"
        )
    }
    else if (equal(weapon, "scout")) copy(output, outputLength, "16competitive/default/scout_fire-1.wav")
    else if (equal(weapon, "sg552")) copy(output, outputLength, "16competitive/default/sg552-1.wav")
    else if (equal(weapon, "aug")) copy(output, outputLength, "16competitive/default/aug-1.wav")
    else if (equal(weapon, "awp")) copy(output, outputLength, "16competitive/default/awp1.wav")
    else if (equal(weapon, "g3sg1")) copy(output, outputLength, "16competitive/default/g3sg1-1.wav")
    else if (equal(weapon, "sg550")) copy(output, outputLength, "16competitive/default/sg550-1.wav")
    else if (equal(weapon, "m249")) copy(output, outputLength, "16competitive/default/m249-1.wav")
    else if (equal(weapon, "knife"))
        copy(
            output,
            outputLength,
            secondary
                ? "16competitive/default/knife_stab.wav"
                : "16competitive/default/knife_slash1.wav"
        )
    else if (equal(weapon, "hegrenade")) copy(output, outputLength, "16competitive/default/explode3.wav")
    else if (equal(weapon, "flashbang")) copy(output, outputLength, "16competitive/default/flashbang-1.wav")
    else if (equal(weapon, "smokegrenade")) copy(output, outputLength, "16competitive/default/sg_explode.wav")
    else return false

    return true
}

// ReGameDLL CS 1.6 passes the held weapon as `item`; the spawned projectile
// is returned by ThrowGrenade and is only available in the post hook.
public on_throw_grenade_pre(id, item, Float:vecSrc[3], Float:vecThrow[3], Float:time, event)
{
    if (id < 1 || id > 32 || !is_user_alive(id)) return
    pendingGrenadeSkinByPlayer[id] = 0

    if (item <= 0) return

    new className[32], weapon[32]
    pev(item, pev_classname, className, charsmax(className))
    copy(weapon, charsmax(weapon), className)
    replace(weapon, charsmax(weapon), "weapon_", "")
    if (
        !equal(weapon, "hegrenade") &&
        !equal(weapon, "flashbang") &&
        !equal(weapon, "smokegrenade")
    ) return

    new skin = resolve_weapon_entity_skin(id, item, weapon)
    if (skin >= 0 && skin < skinCount)
        pendingGrenadeSkinByPlayer[id] = skin + 1
}

public on_throw_grenade_post(id, item, Float:vecSrc[3], Float:vecThrow[3], Float:time, event)
{
    if (id < 1 || id > 32) return

    new skinMarker = pendingGrenadeSkinByPlayer[id]
    pendingGrenadeSkinByPlayer[id] = 0

    // ReAPI forwards ThrowGrenade's CGrenade* as an integer entity index.
    // The hook argument is still the held weapon, not the projectile.
    new grenade = GetHookChainReturn(ATYPE_INTEGER)
    if (grenade <= 0 || grenade > MAX_SKIN_EDICTS || is_nullent(grenade)) return

    new className[32]
    pev(item, pev_classname, className, charsmax(className))
    if (
        !equal(className, "weapon_hegrenade") &&
        !equal(className, "weapon_flashbang") &&
        !equal(className, "weapon_smokegrenade")
    ) return

    grenadeOwnerByEntity[grenade] = id
    grenadeSkinByEntity[grenade] = skinMarker

    new skin = grenadeSkinByEntity[grenade] - 1
    if (skin >= 0 && skin < skinCount)
    {
        engfunc(EngFunc_SetModel, grenade, skinWorldModels[skin])
        if (skin_debug_enabled())
            server_print(
                "[1.6 Competitive][SkinDebug] GrenadeModel entity=%d owner=%d skin=%d world=%s",
                grenade,
                id,
                skin + 1,
                skinWorldModels[skin]
            )
    }
}

public on_hegrenade_explode(grenade, tracehandle, bitsDamageType)
{
    handle_skin_grenade_explosion(grenade, "hegrenade")
}

public on_flashbang_explode(grenade, tracehandle, bitsDamageType)
{
    handle_skin_grenade_explosion(grenade, "flashbang")
}

public on_smokegrenade_explode(grenade)
{
    handle_skin_grenade_explosion(grenade, "smokegrenade")
}

stock handle_skin_grenade_explosion(grenade, const weapon[])
{
    if (grenade <= 0 || grenade > MAX_SKIN_EDICTS) return

    new owner = grenadeOwnerByEntity[grenade]
    new thrownSkin = grenadeSkinByEntity[grenade] - 1

    for (new listener = 1; listener <= 32; listener++)
    {
        if (!is_user_connected(listener) || is_user_bot(listener)) continue
        new listenerSkin = find_player_weapon_skin(listener, weapon)
        if (
            listenerSkin < 0 ||
            listenerSkin >= skinCount ||
            !skinActionSounds[listenerSkin][0]
        ) {
            continue
        }

        if (
            listener == owner &&
            thrownSkin >= 0 &&
            thrownSkin < skinCount &&
            thrownSkin == listenerSkin &&
            skinActionSounds[thrownSkin][0]
        ) {
            client_cmd(
                listener,
                "spk ^"%s^"",
                skinActionSounds[thrownSkin]
            )
        }
        else
        {
            new defaultSound[MAX_SKIN_SOUND_PATH]
            if (get_default_action_sound(weapon, 0, false, defaultSound, charsmax(defaultSound)))
                rh_emit_sound2(
                    grenade,
                    listener,
                    CHAN_WEAPON,
                    defaultSound,
                    VOL_NORM,
                    ATTN_NORM,
                    0,
                    PITCH_NORM
                )
        }
    }

    pendingExplosionGrenade = grenade
    pendingExplosionSpriteIndex =
        thrownSkin >= 0 && thrownSkin < skinCount
            ? skinExplosionSpriteIndexes[thrownSkin]
            : 0
    pendingExplosionSpriteConsumed = false
}

public on_skin_temp_entity(msgId, msgDest, id)
{
    if (
        pendingExplosionGrenade <= 0 ||
        pendingExplosionSpriteIndex <= 0 ||
        get_msg_arg_int(1) != TE_EXPLOSION
    ) return PLUGIN_CONTINUE

    // TE_EXPLOSION arg 5 is the sprite model index. Replacing it here keeps
    // the normal CS explosion timing/scale/flags instead of layering a second
    // cosmetic explosion on top.
    set_msg_arg_int(5, ARG_SHORT, pendingExplosionSpriteIndex)
    pendingExplosionSpriteConsumed = true
    return PLUGIN_CONTINUE
}

public on_hegrenade_explode_post(grenade, tracehandle, bitsDamageType)
{
    finish_skin_grenade_explosion(grenade)
}

public on_flashbang_explode_post(grenade, tracehandle, bitsDamageType)
{
    finish_skin_grenade_explosion(grenade)
}

public on_smokegrenade_explode_post(grenade)
{
    finish_skin_grenade_explosion(grenade)
}

stock finish_skin_grenade_explosion(grenade)
{
    if (grenade <= 0 || grenade > MAX_SKIN_EDICTS) return

    if (
        pendingExplosionGrenade == grenade &&
        pendingExplosionSpriteIndex > 0 &&
        !pendingExplosionSpriteConsumed
    ) {
        // Some grenade paths do not emit TE_EXPLOSION. In that case still
        // show the configured cosmetic effect without adding explosion audio.
        new Float:origin[3]
        pev(grenade, pev_origin, origin)
        message_begin(MSG_BROADCAST, SVC_TEMPENTITY)
        write_byte(TE_EXPLOSION)
        engfunc(EngFunc_WriteCoord, origin[0])
        engfunc(EngFunc_WriteCoord, origin[1])
        engfunc(EngFunc_WriteCoord, origin[2] + 12.0)
        write_short(pendingExplosionSpriteIndex)
        write_byte(20)
        write_byte(20)
        write_byte(TE_EXPLFLAG_NOSOUND)
        message_end()
    }

    if (pendingExplosionGrenade == grenade)
    {
        pendingExplosionGrenade = 0
        pendingExplosionSpriteIndex = 0
        pendingExplosionSpriteConsumed = false
    }
    grenadeOwnerByEntity[grenade] = 0
    grenadeSkinByEntity[grenade] = 0
}

public on_current_weapon(id)
{
    if (!is_user_alive(id)) return

    new weaponId = read_data(2), weapon[32]
    get_weaponname(weaponId, weapon, charsmax(weapon))
    replace(weapon, charsmax(weapon), "weapon_", "")
    new activeWeapon = get_member(id, m_pActiveItem)
    new marker = activeWeapon > 0 ? pev(activeWeapon, pev_iuser4) : 0
    new skin = marker - 1
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] CurWeapon player=%d weapon=%s item=%d marker=%d", id, weapon, activeWeapon, marker)
    if (marker == 0)
    {
        skin = find_player_weapon_skin(id, weapon)
        if (skin != -1 && activeWeapon > 0)
        {
            set_pev(activeWeapon, pev_iuser4, skin + 1)
            if (skin_debug_enabled())
                server_print("[1.6 Competitive][SkinDebug] assigned equipped skin=%d player=%d item=%d", skin + 1, id, activeWeapon)
        }
    }
    if (skin < 0 || skin >= skinCount)
    {
        if (skin_debug_enabled())
            server_print("[1.6 Competitive][SkinDebug] no skin player=%d weapon=%s item=%d marker=%d", id, weapon, activeWeapon, marker)
        hide_skin_player_model(id)
        return
    }

    apply_skin_models(id, skin)
    schedule_skin_reapply(id)
    if (get_cvar_num("competitive_dev_commands"))
        server_print("[1.6 Competitive] Applied skin %d to player %d for %s", skin + 1, id, weapon)
}

public on_weapon_pickup(id)
{
    if (!is_user_alive(id)) return

    new weaponId = read_data(1)
    track_deathmatch_consumable(id, weaponId)
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] WeapPickup player=%d weaponId=%d", id, weaponId)
    schedule_skin_reapply(id)
}

public on_weapon_deploy_pre(item)
{
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] DeployPre player=%d item=%d marker=%d", id, item, pev(item, pev_iuser4))
    hide_skin_player_model(id)
}

public on_weapon_deploy_post(item)
{
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return

    new marker = pev(item, pev_iuser4)
    new skin = marker - 1
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] DeployPost player=%d bot=%d item=%d marker=%d", id, is_user_bot(id), item, marker)

    if (skin >= 0 && skin < skinCount)
    {
        apply_skin_models(id, skin)
        schedule_skin_reapply(id)
    }
}

public schedule_skin_reapply(id)
{
    remove_task(TASK_SKIN_REAPPLY + id)
    set_task(0.1, "reapply_active_weapon_skin", TASK_SKIN_REAPPLY + id)
}

// Bhop Abilities 0.5.2's jump path lives here, gated to Legacy. Setting
// oldbuttons prevents the native jump while this hook provides the impulse.
public on_legacy_player_jump(id)
{
    if (!get_pcvar_num(legacyMovement) || !is_user_alive(id)) return HAM_IGNORED

    new style = get_pcvar_num(legacyBhopStyle)
    new oldButtons = pev(id, pev_oldbuttons)
    new bool:autoBhop = bool:(get_pcvar_num(legacyAutoBhop) || legacyPlayerAutoBhop[id])
    new flags = pev(id, pev_flags)
    if (!style)
    {
        if (autoBhop && (oldButtons & IN_JUMP) && (flags & FL_ONGROUND))
        {
            set_pev(id, pev_oldbuttons, oldButtons & ~IN_JUMP)
            set_pev(id, pev_gaitsequence, 6)
            set_pev(id, pev_frame, 0.0)
        }
        return HAM_IGNORED
    }

    if (legacyWaterJumpTime[id] || pev(id, pev_waterlevel) >= 2 ||
        !(flags & FL_ONGROUND) || (!autoBhop && (oldButtons & IN_JUMP)))
        return HAM_IGNORED

    set_pev(id, pev_oldbuttons, oldButtons | IN_JUMP)
    new Float:velocity[3]
    pev(id, pev_velocity, velocity)
    if (style == 1)
    {
        new Float:maxSpeed
        pev(id, pev_maxspeed, maxSpeed)
        if (maxSpeed > 0.0)
        {
            new Float:threshold = maxSpeed * LEGACY_BHOP_MAX_SPEED_FACTOR
            new Float:speed = floatsqroot(
                velocity[0] * velocity[0] + velocity[1] * velocity[1] +
                velocity[2] * velocity[2])
            if (speed > threshold)
            {
                new Float:fraction = threshold / speed * 0.65
                velocity[0] *= fraction
                velocity[1] *= fraction
                velocity[2] *= fraction
            }
        }
    }

    new longJump = 0
    if ((pev(id, pev_bInDuck) || (flags & FL_DUCKING)) &&
        get_member(id, m_fLongJump) && (pev(id, pev_button) & IN_DUCK) &&
        pev(id, pev_flDuckTime))
    {
        new Float:punch[3], Float:forwardVector[3]
        pev(id, pev_punchangle, punch)
        punch[0] = -5.0
        set_pev(id, pev_punchangle, punch)
        global_get(glb_v_forward, forwardVector)
        velocity[0] = forwardVector[0] * 560.0
        velocity[1] = forwardVector[1] * 560.0
        velocity[2] = 299.3325909419153
        longJump = 1
    }
    else
        velocity[2] = 268.32815729997476

    new Float:playerGravity, Float:frameTime
    pev(id, pev_gravity, playerGravity)
    global_get(glb_frametime, frameTime)
    velocity[2] -= playerGravity * frameTime *
        0.5 * get_cvar_num("sv_gravity")
    set_pev(id, pev_velocity, velocity)
    set_pev(id, pev_gaitsequence, 6 + longJump)
    set_pev(id, pev_frame, 0.0)
    return HAM_IGNORED
}

public on_legacy_update_client_data(id, sendWeapons, clientData)
{
    if (id >= 1 && id <= 32 && get_pcvar_num(legacyMovement))
        legacyWaterJumpTime[id] = get_cd(clientData, CD_WaterJumpTime)
    return FMRES_IGNORED
}

public on_legacy_admin_autobhop(id, level, cid)
{
    if (!cmd_access(id, level, cid, 2)) return PLUGIN_HANDLED
    if (!get_pcvar_num(legacyMovement))
    {
        console_print(id, "[1.6 Competitive] Auto-hop overrides are available only in Legacy.")
        return PLUGIN_HANDLED
    }

    new targetName[32]
    read_argv(1, targetName, charsmax(targetName))
    new target = cmd_target(id, targetName,
        CMDTARGET_OBEY_IMMUNITY | CMDTARGET_ALLOW_SELF | CMDTARGET_NO_BOTS)
    if (!target) return PLUGIN_HANDLED

    if (read_argc() < 3)
        legacyPlayerAutoBhop[target] = !legacyPlayerAutoBhop[target]
    else
    {
        new value[2]
        read_argv(2, value, charsmax(value))
        if (value[0] != '0' && value[0] != '1')
        {
            console_print(id, "[1.6 Competitive] Use 0 or 1 for auto-hop.")
            return PLUGIN_HANDLED
        }
        legacyPlayerAutoBhop[target] = bool:(value[0] == '1')
    }
    console_print(id, "[1.6 Competitive] %s auto-hop: %s", targetName,
        legacyPlayerAutoBhop[target] ? "On" : "Off")
    return PLUGIN_HANDLED
}

stock register_legacy_weapon_hooks()
{
    new const pistols[][] = {
        "weapon_p228", "weapon_elite", "weapon_fiveseven",
        "weapon_usp", "weapon_glock18", "weapon_deagle"
    }
    for (new i = 0; i < sizeof pistols; i++)
    {
        RegisterHam(Ham_Weapon_PrimaryAttack, pistols[i], "on_legacy_pistol_attack_pre", false)
        RegisterHam(Ham_Weapon_PrimaryAttack, pistols[i], "on_legacy_pistol_attack_post", true)
    }
    RegisterHam(Ham_Weapon_PrimaryAttack, "weapon_c4", "on_legacy_c4_attack_pre", false)
    RegisterHam(Ham_Weapon_PrimaryAttack, "weapon_c4", "on_legacy_c4_attack_post", true)
    RegisterHam(Ham_Item_Deploy, "weapon_awp", "on_legacy_awp_deploy_post", true)
}

public on_legacy_pistol_attack_pre(item)
{
    if (!get_pcvar_num(legacyMovement)) return HAM_IGNORED
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return HAM_IGNORED

    legacyPistolFlags[id] = pev(id, pev_flags)
    pev(id, pev_velocity, legacyPistolVelocity[id])
    legacyPistolAttackOverride[id] = true
    // Match cs13.sma's effective behavior: spoof grounded fire and, when the
    // player was grounded already, suppress movement for this attack only.
    set_pev(id, pev_flags, legacyPistolFlags[id] | FL_ONGROUND)
    if (legacyPistolFlags[id] & FL_ONGROUND)
    {
        new Float:still[3] = {0.0, 0.0, 0.0}
        set_pev(id, pev_velocity, still)
    }
    return HAM_IGNORED
}

public on_legacy_pistol_attack_post(item)
{
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !legacyPistolAttackOverride[id]) return HAM_IGNORED
    set_pev(id, pev_flags, legacyPistolFlags[id])
    set_pev(id, pev_velocity, legacyPistolVelocity[id])
    legacyPistolAttackOverride[id] = false
    return HAM_IGNORED
}

public on_legacy_c4_attack_pre(item)
{
    if (!get_pcvar_num(legacyMovement)) return HAM_IGNORED
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return HAM_IGNORED
    legacyC4Flags[id] = pev(id, pev_flags)
    legacyC4AttackOverride[id] = true
    set_pev(id, pev_flags, legacyC4Flags[id] | FL_ONGROUND)
    return HAM_IGNORED
}

public on_legacy_c4_attack_post(item)
{
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !legacyC4AttackOverride[id]) return HAM_IGNORED
    set_pev(id, pev_flags, legacyC4Flags[id])
    set_pev(id, pev_maxspeed, 250.0)
    legacyC4AttackOverride[id] = false
    return HAM_IGNORED
}

public on_legacy_awp_deploy_post(item)
{
    if (!get_pcvar_num(legacyMovement)) return HAM_IGNORED
    new id = get_member(item, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return HAM_IGNORED
    set_member(item, m_Weapon_flNextPrimaryAttack, LEGACY_AWP_DEPLOY_DELAY + 0.01)
    set_member(item, m_Weapon_flNextSecondaryAttack, LEGACY_AWP_DEPLOY_DELAY)
    set_member(id, m_flNextAttack, LEGACY_AWP_DEPLOY_DELAY)
    return HAM_IGNORED
}

// YaPB can request shift speed at waypoints even with walking disabled. Bring
// sustained movement back to the weapon's normal run speed before each hop.
stock bool:legacy_bot_wall_ahead(id, const Float:direction[3])
{
    new Float:origin[3], Float:destination[3], Float:fraction
    pev(id, pev_origin, origin)
    destination[0] = origin[0] + direction[0] * LEGACY_BOT_WALL_LOOKAHEAD
    destination[1] = origin[1] + direction[1] * LEGACY_BOT_WALL_LOOKAHEAD
    destination[2] = origin[2]
    engfunc(EngFunc_TraceHull, origin, destination, IGNORE_MONSTERS, HULL_HUMAN, id, 0)
    get_tr2(0, TR_flFraction, fraction)
    return bool:(get_tr2(0, TR_StartSolid) || fraction < 1.0)
}

public on_legacy_bot_cmd_start(id, command, seed)
{
    if (!get_pcvar_num(legacyMovement)) return FMRES_IGNORED
    if (!is_user_alive(id))
    {
        legacyBotCrouchHop[id] = false
        return FMRES_IGNORED
    }

    new buttons = get_uc(command, UC_Buttons)
    if (get_pcvar_num(legacyBhopStyle) && (buttons & IN_USE) &&
        (pev(id, pev_flags) & FL_ONGROUND))
    {
        new Float:useVelocity[3]
        pev(id, pev_velocity, useVelocity)
        useVelocity[0] *= LEGACY_USE_SLOWDOWN
        useVelocity[1] *= LEGACY_USE_SLOWDOWN
        useVelocity[2] *= LEGACY_USE_SLOWDOWN
        set_pev(id, pev_velocity, useVelocity)
    }
    if (!is_user_bot(id) || !legacyBotBhopEligible[id]) return FMRES_IGNORED
    // YaPB can start its own jumps as well as our chained hops. Keep every
    // Legacy bot from shooting in the air; on landing, attack takes priority.
    if (!(pev(id, pev_flags) & FL_ONGROUND) &&
        (buttons & (IN_ATTACK | IN_ATTACK2)))
    {
        buttons &= ~(IN_ATTACK | IN_ATTACK2)
        set_uc(command, UC_Buttons, buttons)
    }
    // Shooting takes priority, including when YaPB itself requested a jump.
    if (buttons & (IN_ATTACK | IN_ATTACK2))
    {
        legacyBotCrouchHop[id] = false
        set_uc(command, UC_Buttons, buttons & ~IN_JUMP)
        return FMRES_IGNORED
    }

    if (buttons & IN_USE ||
        ((buttons & IN_DUCK) && (pev(id, pev_flags) & FL_ONGROUND) &&
            !legacyBotCrouchHop[id]) ||
        pev(id, pev_movetype) == MOVETYPE_FLY ||
        pev(id, pev_waterlevel) >= 2)
    {
        legacyBotCrouchHop[id] = false
        return FMRES_IGNORED
    }

    if (legacyBotCrouchHop[id] && (pev(id, pev_flags) & FL_ONGROUND))
    {
        buttons &= ~IN_DUCK
        set_uc(command, UC_Buttons, buttons)
    }

    // Keep YaPB's view angles and movement commands intact. Forced air-strafe
    // angles fight its aim smoothing and waypoint steering (flicks/circles).
    new Float:now = get_gametime()
    if (now < legacyBotHopRetryAt[id]) return FMRES_IGNORED
    new Float:forwardMove, Float:side, Float:maxSpeed
    get_uc(command, UC_ForwardMove, forwardMove)
    get_uc(command, UC_SideMove, side)
    pev(id, pev_maxspeed, maxSpeed)
    if (maxSpeed <= 0.0) return FMRES_IGNORED
    new Float:moveSquared = forwardMove * forwardMove + side * side
    new Float:angles[3], Float:wishForward[3], Float:right[3], Float:wish[3]
    get_uc(command, UC_ViewAngles, angles)
    angles[0] = 0.0
    angles[2] = 0.0
    angle_vector(angles, ANGLEVECTOR_FORWARD, wishForward)
    angle_vector(angles, ANGLEVECTOR_RIGHT, right)
    wish[0] = wishForward[0] * forwardMove + right[0] * side
    wish[1] = wishForward[1] * forwardMove + right[1] * side
    wish[2] = 0.0
    new Float:wishLength = vector_length(wish)
    if (wishLength > 0.0)
    {
        wish[0] /= wishLength
        wish[1] /= wishLength
    }

    if (legacyBotCrouchHop[id])
    {
        new Float:origin[3], bool:stalled = false
        pev(id, pev_origin, origin)
        if (now - legacyBotProgressAt[id] >= 0.6)
        {
            new Float:dx = origin[0] - legacyBotProgressOrigin[id][0]
            new Float:dy = origin[1] - legacyBotProgressOrigin[id][1]
            stalled = bool:(dx * dx + dy * dy < 48.0 * 48.0)
            legacyBotProgressOrigin[id] = origin
            legacyBotProgressAt[id] = now
        }
        if (stalled || now - legacyBotHopStartedAt[id] >= LEGACY_BOT_MAX_CHAIN_TIME ||
            moveSquared < LEGACY_BOT_MIN_RUN_COMMAND_SQUARED ||
            wish[0] * legacyBotHopDirection[id][0] +
                wish[1] * legacyBotHopDirection[id][1] < 0.7 ||
            legacy_bot_wall_ahead(id, wish) ||
            legacy_bot_wall_ahead(id, legacyBotHopDirection[id]))
        {
            legacyBotCrouchHop[id] = false
            legacyBotHopRetryAt[id] = now + LEGACY_BOT_HOP_COOLDOWN
            // This command still contains YaPB's original buttons and steering.
            // Its own obstacle jumps remain available during recovery.
            return FMRES_IGNORED
        }
    }

    if (!(pev(id, pev_flags) & FL_ONGROUND))
    {
        if (legacyBotCrouchHop[id])
        {
            // GoldSrc requires a new press edge on landing. Never carry
            // YaPB's jump button through the airborne part of this hop.
            buttons &= ~IN_JUMP
            set_uc(command, UC_Buttons, buttons)
            new Float:velocity[3]
            pev(id, pev_velocity, velocity)
            new Float:verticalSpeed = velocity[2]
            new Float:feet[3], Float:mins[3], Float:traceEnd[3], Float:fraction
            pev(id, pev_origin, feet)
            pev(id, pev_mins, mins)
            feet[2] += mins[2] + 1.0
            traceEnd = feet
            traceEnd[2] -= 64.0
            engfunc(EngFunc_TraceLine, feet, traceEnd, IGNORE_MONSTERS, id, 0)
            get_tr2(0, TR_flFraction, fraction)

            // Tuck the legs during flight, then stand before touching down so
            // the next grounded jump can fire without a walking step.
            if (verticalSpeed >= 0.0 || fraction * 64.0 > LEGACY_BOT_CROUCH_RELEASE_DISTANCE)
                set_uc(command, UC_Buttons, buttons | IN_DUCK)
            else
                set_uc(command, UC_Buttons, buttons & ~IN_DUCK)
        }
        return FMRES_IGNORED
    }

    if (!legacyBotCrouchHop[id] && moveSquared < LEGACY_BOT_MIN_RUN_COMMAND_SQUARED)
        return FMRES_IGNORED

    // A movement command is not momentum: bots can be nearly stopped while
    // steering around a node. Build real horizontal speed before hopping.
    new Float:velocity[3]
    pev(id, pev_velocity, velocity)
    new Float:speedSquared = velocity[0] * velocity[0] + velocity[1] * velocity[1]
    if (speedSquared < maxSpeed * maxSpeed *
        LEGACY_BOT_HOP_MIN_SPEED_FRACTION * LEGACY_BOT_HOP_MIN_SPEED_FRACTION)
    {
        legacyBotCrouchHop[id] = false
        legacyBotHopRetryAt[id] = now + LEGACY_BOT_HOP_COOLDOWN
        return FMRES_IGNORED
    }

    if (legacyBotCrouchHop[id])
    {
        if (velocity[0] * legacyBotHopDirection[id][0] +
            velocity[1] * legacyBotHopDirection[id][1] < floatsqroot(speedSquared) * 0.35)
        {
            legacyBotCrouchHop[id] = false
            legacyBotHopRetryAt[id] = now + LEGACY_BOT_HOP_COOLDOWN
            return FMRES_IGNORED
        }
    }
    else
    {
        new Float:speed = floatsqroot(speedSquared)
        legacyBotHopDirection[id][0] = velocity[0] / speed
        legacyBotHopDirection[id][1] = velocity[1] / speed
        legacyBotHopDirection[id][2] = 0.0
        if (wish[0] * legacyBotHopDirection[id][0] +
            wish[1] * legacyBotHopDirection[id][1] < 0.7 ||
            legacy_bot_wall_ahead(id, wish) ||
            legacy_bot_wall_ahead(id, legacyBotHopDirection[id]))
        {
            legacyBotHopRetryAt[id] = now + LEGACY_BOT_HOP_COOLDOWN
            return FMRES_IGNORED
        }
        legacyBotHopStartedAt[id] = now
        legacyBotProgressAt[id] = now
        pev(id, pev_origin, legacyBotProgressOrigin[id])
    }

    set_uc(command, UC_Buttons, buttons | IN_JUMP)
    legacyBotCrouchHop[id] = true
    return FMRES_IGNORED
}

// ReGameDLL consults this before a player buys an item, before a player picks a
// weapon off the ground, and while applying spawn equipment. Reporting the
// tactical shield as restricted blocks every way a player could otherwise still
// acquire one, and it happens before the engine deducts any money.
public on_has_restrict_item_pre(id, ItemID:item, ItemRestType:type)
{
    // Reject purchases during a suppressed round-based respawn or outside
    // FFA's native immunity window, including menus opened before it expired.
    if (type == ITEM_TYPE_BUYING &&
        (suppressReconnectRespawn[id] || (is_full_deathmatch() && !ffaProtected[id])))
    {
        SetHookChainReturn(ATYPE_BOOL, true)
        return HC_SUPERCEDE
    }

    if (item == ITEM_SHIELDGUN || (is_full_deathmatch() && item == ITEM_C4))
    {
        SetHookChainReturn(ATYPE_BOOL, true)
        return HC_SUPERCEDE
    }
    return HC_CONTINUE
}

public reapply_active_weapon_skin(taskId)
{
    new id = taskId - TASK_SKIN_REAPPLY
    if (!is_user_alive(id)) return

    new activeWeapon = get_member(id, m_pActiveItem)
    if (activeWeapon <= 0)
    {
        if (skin_debug_enabled()) server_print("[1.6 Competitive][SkinDebug] Reapply player=%d has no active item", id)
        return
    }

    new marker = pev(activeWeapon, pev_iuser4)
    new skin = marker - 1
    if (skin < 0 || skin >= skinCount)
    {
        if (skin_debug_enabled())
            server_print("[1.6 Competitive][SkinDebug] Reapply player=%d item=%d invalid marker=%d skinCount=%d", id, activeWeapon, marker, skinCount)
        hide_skin_player_model(id)
        return
    }

    apply_skin_models(id, skin)
    if (get_cvar_num("competitive_dev_commands"))
        server_print("[1.6 Competitive] Reapplied transferred skin %d to player %d", skin + 1, id)
}

stock apply_skin_models(id, skin)
{
    set_pev(id, pev_viewmodel2, skinViewModels[skin])
    set_pev(id, pev_weaponmodel2, SKIN_NULL_PLAYER_MODEL)
    show_skin_player_model(id, skin)
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] ModelsApplied player=%d skin=%d follower=%d v=%s p=%s w=%s", id, skin + 1, skinPlayerModelEntities[id], skinViewModels[skin], skinPlayerModels[skin], skinWorldModels[skin])
}

stock create_skin_player_model_entity(id)
{
    if (skinPlayerModelEntities[id] > 0 && !is_nullent(skinPlayerModelEntities[id])) return

    new entity = rg_create_entity("info_target")
    if (is_nullent(entity))
    {
        if (skin_debug_enabled()) server_print("[1.6 Competitive][SkinDebug] follower create FAILED player=%d", id)
        return
    }

    skinPlayerModelEntities[id] = entity
    set_pev(entity, pev_classname, "competitive_skin_pmodel")
    set_pev(entity, pev_movetype, MOVETYPE_FOLLOW)
    set_pev(entity, pev_solid, SOLID_NOT)
    set_pev(entity, pev_owner, id)
    set_pev(entity, pev_aiment, id)
    set_pev(entity, pev_effects, EF_NODRAW)
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] follower created player=%d entity=%d", id, entity)
}

stock show_skin_player_model(id, skin)
{
    create_skin_player_model_entity(id)
    new entity = skinPlayerModelEntities[id]
    if (is_nullent(entity))
    {
        if (skin_debug_enabled()) server_print("[1.6 Competitive][SkinDebug] follower unavailable player=%d skin=%d", id, skin + 1)
        return
    }

    engfunc(EngFunc_SetModel, entity, skinPlayerModels[skin])
    set_pev(entity, pev_body, 0)
    set_pev(entity, pev_skin, 0)
    set_pev(entity, pev_sequence, 0)
    set_pev(entity, pev_frame, 0.0)
    set_pev(entity, pev_framerate, 1.0)
    set_pev(entity, pev_animtime, get_gametime())
    set_pev(entity, pev_effects, pev(entity, pev_effects) & ~EF_NODRAW)
    if (ffaProtected[id])
    {
        set_pev(entity, pev_rendermode, kRenderTransAlpha)
        set_pev(entity, pev_renderamt, FFA_PROTECTION_ALPHA)
    }
    else
    {
        set_pev(entity, pev_rendermode, kRenderNormal)
        set_pev(entity, pev_renderamt, 255.0)
    }
    set_entvar(id, var_controller, 128, 0)
    set_entvar(id, var_controller, 128, 1)
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] follower shown player=%d entity=%d modelIndex=%d effects=%d", id, entity, pev(entity, pev_modelindex), pev(entity, pev_effects))
}

stock hide_skin_player_model(id)
{
    new entity = skinPlayerModelEntities[id]
    if (is_nullent(entity)) return
    set_pev(entity, pev_effects, pev(entity, pev_effects) | EF_NODRAW)
}

stock remove_skin_player_model_entity(id)
{
    new entity = skinPlayerModelEntities[id]
    skinPlayerModelEntities[id] = 0
    if (is_nullent(entity)) return
    set_pev(entity, pev_flags, pev(entity, pev_flags) | FL_KILLME)
}

public on_weaponbox_set_model(weaponbox, const modelName[])
{
    for (new slot = 0; slot <= 6; slot++)
    {
        new weapon = get_member(weaponbox, m_WeaponBox_rgpPlayerItems, slot)
        if (weapon <= 0) continue
        new marker = pev(weapon, pev_iuser4)
        new skin = marker - 1
        if (skin_debug_enabled())
            server_print("[1.6 Competitive][SkinDebug] WeaponBox box=%d slot=%d item=%d marker=%d original=%s", weaponbox, slot, weapon, marker, modelName)
        if (skin < 0 || skin >= skinCount)
        {
            if (marker == 0) set_pev(weapon, pev_iuser4, SKIN_MARKER_UNSKINNED)
            continue
        }
        SetHookChainArg(2, ATYPE_STRING, skinWorldModels[skin])
        if (skin_debug_enabled())
            server_print("[1.6 Competitive][SkinDebug] WeaponBoxApplied box=%d item=%d skin=%d world=%s", weaponbox, weapon, skin + 1, skinWorldModels[skin])
        return
    }
    if (skin_debug_enabled())
        server_print("[1.6 Competitive][SkinDebug] WeaponBoxNoSkin box=%d original=%s", weaponbox, modelName)
}

public show_match_motd(taskId)
{
    new id = taskId - TASK_MOTD
    if (!is_user_connected(id)) return

    new motd[1536]
    new length = formatex(motd, charsmax(motd), "<html><head><style>body{margin:0;background:#10151c;color:#e9f1fb;font:14px Arial,sans-serif}.card{margin:16px;padding:18px;background:#18212c;border:1px solid #2e465d}.brand{color:#82d4ff;font-size:22px;font-weight:bold}.thanks{color:#9ab0c7;margin:5px 0 18px}.section{color:#82d4ff;font-weight:bold;border-bottom:1px solid #2e465d;padding-bottom:6px;margin:15px 0 7px}.quest{padding:7px 0;border-bottom:1px solid #243242}.done{color:#86db9b}.muted{color:#9ab0c7}</style></head><body><div class=^"card^"><div class=^"brand^">1.6 COMPETITIVE</div><div class=^"thanks^">Thank you for playing 1.6 Competitive.</div><div class=^"section^">YOUR DAILY MISSIONS</div>")

    new rosterIndex = playerRosterIndex[id] - 1
    if (rosterIndex >= 0 && rosterIndex < rosterCount && rosterQuestCount[rosterIndex] > 0)
    {
        for (new quest = 0; quest < rosterQuestCount[rosterIndex]; quest++)
            length += formatex(motd[length], charsmax(motd) - length, "<div class=^"quest%s^">%s<br><span class=^"muted^">%d / %d &middot; +%d points%s</span></div>", rosterQuestCompleted[rosterIndex][quest] ? " done" : "", rosterQuestTitles[rosterIndex][quest], rosterQuestProgress[rosterIndex][quest], rosterQuestTargets[rosterIndex][quest], rosterQuestRewards[rosterIndex][quest], rosterQuestCompleted[rosterIndex][quest] ? " &middot; COMPLETE" : "")
    }
    else
        length += formatex(motd[length], charsmax(motd) - length, "<span class=^"muted^">Daily missions are loading. Check your launcher shortly.</span>")

    length += formatex(motd[length], charsmax(motd) - length, "<div class=^"thanks^">GLHF.</div></div></body></html>")
    show_motd(id, motd, "1.6 Competitive")
}

public client_infochanged(id)
{
    if (!is_user_connected(id) || is_user_hltv(id) || is_competitive_bot(id) || logicalTeam[id] != 0) return
    remove_task(TASK_AUTO_TEAM + id)
    set_task(0.1, "auto_assign_team", TASK_AUTO_TEAM + id)
}

public auto_assign_team(taskId)
{
    new id = taskId - TASK_AUTO_TEAM
    if (!is_user_connected(id)) return

    logicalTeam[id] = find_logical_team(id)
    if (friendly_fire_rejoin_blocked(id)) return
    if (logicalTeam[id] != 0 && !is_competitive_bot(id))
    {
        new joinToken[65], fingerprint[13]
        get_match_join_token(id, joinToken, charsmax(joinToken))
        token_fingerprint(joinToken, fingerprint, charsmax(fingerprint))
        server_print("[1.6 Competitive][Join] assigned userid=%d team=%d afterRetry=%d fingerprint=%s", get_user_userid(id), logicalTeam[id], assignmentPendingLogged[id], fingerprint)
        assignmentPendingLogged[id] = false
    }
    if (logicalTeam[id] == 3)
    {
        rg_join_team(id, TEAM_SPECTATOR)
        rg_set_observer_mode(id, OBS_IN_EYE)
        new rosterIndex = playerRosterIndex[id] - 1
        write_event("player_connected", id, rosterNames[rosterIndex])
        client_print(id, print_chat, "[1.6 Competitive] Connected in a spectator slot.")
        check_match_ready()
        return
    }
    if (logicalTeam[id] == 0)
    {
        if (is_competitive_bot(id))
        {
            // Stop the controller replacing this rejected bot immediately.
            sync_roster_bot_quota()
            server_cmd("kick #%d", get_user_userid(id))
            server_exec()
            return
        }
        new joinToken[65]
        get_match_join_token(id, joinToken, charsmax(joinToken))
        if (!assignmentPendingLogged[id])
        {
            assignmentPendingLogged[id] = true
            new fingerprint[13]
            token_fingerprint(joinToken, fingerprint, charsmax(fingerprint))
            server_print("[1.6 Competitive][Join] waiting for match token userid=%d manualPrefix=%d fingerprint=%s", get_user_userid(id), equal(joinToken, "m_", 2), fingerprint)
        }
        // A client can arrive before its current match identity reaches userinfo.
        // Retry for up to ten seconds, including when an old manual token is present.
        if (get_gametime() - assignmentStartedAt[id] < JOIN_TOKEN_GRACE_SECONDS)
        {
            set_task(0.5, "auto_assign_team", TASK_AUTO_TEAM + id)
            return
        }
        write_event_number("roster_unmatched", joinToken[0] != 0)
        new fingerprint[13]
        token_fingerprint(joinToken, fingerprint, charsmax(fingerprint))
        server_print("[1.6 Competitive][Join] token grace expired userid=%d fingerprint=%s", get_user_userid(id), fingerprint)
        if (joinToken[0])
        {
            server_cmd("kick #%d", get_user_userid(id))
            server_exec()
            return
        }
        // Use ReGameDLL's real spectator join path instead of only changing
        // m_iTeam. A raw team field change leaves humans in a partial
        // spectator state where normal observer controls may not initialize.
        rg_join_team(id, TEAM_SPECTATOR)
        rg_set_observer_mode(id, OBS_IN_EYE)
        client_print(id, print_chat, "[1.6 Competitive] Connected as a match observer.")
        return
    }
    if (is_full_deathmatch() && !is_competitive_bot(id))
    {
        // In FFA, let humans complete Counter-Strike's normal initial side
        // selection instead of silently forcing them onto Terrorist.
        wait_for_ffa_team_selection(TASK_AUTO_TEAM + id)
        return
    }

    apply_player_side(id)
    finish_player_assignment(id)
}

public wait_for_ffa_team_selection(taskId)
{
    new id = taskId - TASK_AUTO_TEAM
    if (!is_user_connected(id) || !is_full_deathmatch() || is_competitive_bot(id)) return
    if (logicalTeam[id] != 1 && logicalTeam[id] != 2) return

    new CsTeams:selectedSide = cs_get_user_team(id)
    if (selectedSide != CS_TEAM_T && selectedSide != CS_TEAM_CT)
    {
        remove_task(TASK_AUTO_TEAM + id)
        set_task(0.25, "wait_for_ffa_team_selection", TASK_AUTO_TEAM + id)
        return
    }

    lockedTeam[id] = selectedSide
    if (is_ffa_deathmatch() && is_user_alive(id) && !ffaProtected[id])
    {
        // A player's first team-join spawn can skip ReGameDLL's PlayerSpawn
        // protection callback. The forced respawn below then skips an alive
        // player, leaving their first life unable to buy until they die.
        new Float:remaining = Float:get_member(id, m_flSpawnProtectionEndTime) - get_gametime()
        if (remaining <= 0.0)
        {
            remaining = FFA_PROTECTION_SECONDS
            set_member(id, m_flSpawnProtectionEndTime, get_gametime() + remaining)
        }
        on_ffa_protection_set(id, remaining)
    }
    remove_task(TASK_RESPAWN + id)
    set_task(0.2, "respawn_assigned_player", TASK_RESPAWN + id)
    finish_player_assignment(id)
}

stock finish_player_assignment(id)
{
    if (playerRosterIndex[id] > 0)
    {
        refresh_player_score(id)

        // GoldSrc applies set_user_info("name") asynchronously. Report the
        // canonical roster value directly; get_user_name can still return the
        // client's old name here even though token/name/IP validation passed.
        new rosterIndex = playerRosterIndex[id] - 1
        write_event("player_connected", id, rosterNames[rosterIndex])
    }

    new name[32]
    get_user_name(id, name, charsmax(name))
    client_print(0, print_chat, "[1.6 Competitive] %s connected to a 1.6 Competitive game.", name)
    check_match_ready()
}

stock set_ffa_protection_rendering(id, bool:protected)
{
    if (!is_user_connected(id)) return

    if (protected)
    {
        set_pev(id, pev_rendermode, kRenderTransAlpha)
        set_pev(id, pev_renderamt, FFA_PROTECTION_ALPHA)
    }
    else
    {
        set_pev(id, pev_rendermode, ffaProtectionRenderMode[id])
        set_pev(id, pev_renderamt, ffaProtectionRenderAmt[id])
    }

    new entity = skinPlayerModelEntities[id]
    if (!is_nullent(entity))
    {
        if (protected)
        {
            set_pev(entity, pev_rendermode, kRenderTransAlpha)
            set_pev(entity, pev_renderamt, FFA_PROTECTION_ALPHA)
        }
        else
        {
            set_pev(entity, pev_rendermode, kRenderNormal)
            set_pev(entity, pev_renderamt, 255.0)
        }
    }

}

stock set_ffa_buy_icon(id, bool:visible)
{
    if (!is_user_connected(id) || is_user_bot(id) || is_user_hltv(id)) return

    message_begin(MSG_ONE, get_user_msgid("StatusIcon"), _, id)
    write_byte(visible ? 1 : 0)
    write_string("buyzone")
    if (visible)
    {
        write_byte(0)
        write_byte(160)
        write_byte(0)
    }
    message_end()
}

public on_ffa_status_icon(messageId, messageDestination, id)
{
    if (!is_ffa_deathmatch() || !is_user_connected(id) || ffaProtected[id])
        return PLUGIN_CONTINUE

    new icon[16]
    get_msg_arg_string(2, icon, charsmax(icon))
    // mp_buy_anywhere keeps the engine's buy-zone signal active for the entire
    // FFA match. Buying ends with spawn protection, so suppress its stale icon.
    if (equal(icon, "buyzone") && get_msg_arg_int(1) != 0)
        return PLUGIN_HANDLED

    return PLUGIN_CONTINUE
}

public block_ffa_buy_menu(id)
{
    if (is_fight_yard()) return PLUGIN_HANDLED
    if (is_ffa_deathmatch() && !ffaProtected[id]) return PLUGIN_HANDLED
    return PLUGIN_CONTINUE
}

public on_ffa_protection_set(id, Float:duration)
{
    if (!is_full_deathmatch() || duration <= 0.0 || ffaProtected[id]) return
    if (logicalTeam[id] != 1 && logicalTeam[id] != 2) return
    if (is_user_hltv(id) || is_aimbot_detection_probe(id)) return

    ffaProtected[id] = true
    ffaProtectionFlags[id] = pev(id, pev_flags) & FL_NOTARGET
    ffaProtectionRenderMode[id] = pev(id, pev_rendermode)
    pev(id, pev_renderamt, ffaProtectionRenderAmt[id])

    // Keep the engine's no-target protection, but show a translucent player
    // instead of hiding them completely with EF_NODRAW.
    set_pev(id, pev_flags, pev(id, pev_flags) | FL_NOTARGET)
    set_ffa_protection_rendering(id, true)
    set_ffa_buy_icon(id, true)

    // Reapply the current custom p-model so it fades together with the player
    // instead of becoming an opaque floating weapon or disappearing entirely.
    if (is_user_alive(id)) schedule_skin_reapply(id)

    if (!is_competitive_bot(id))
    {
        if (is_fight_yard())
            client_print(id, print_center, "Spawn protection: %d seconds. Fire to end protection.", floatround(duration))
        else
            client_print(id, print_center, "Spawn protection: %d seconds. Fire to end protection and buying.", floatround(duration))
    }
}

public on_ffa_protection_removed(id)
{
    if (!ffaProtected[id]) return
    ffaProtected[id] = false
    set_pev(id, pev_flags, (pev(id, pev_flags) & ~FL_NOTARGET) | ffaProtectionFlags[id])
    set_ffa_protection_rendering(id, false)
    set_ffa_buy_icon(id, false)
    if (is_user_alive(id)) schedule_skin_reapply(id)
}

public block_ffa_weapon_drop(id)
{
    if (is_ffa_deathmatch()) return PLUGIN_HANDLED
    return PLUGIN_CONTINUE
}

public block_team_selection(id)
{
    if (performingAutoAssignment[id]) return PLUGIN_CONTINUE
    if (is_ffa_deathmatch())
    {
        if (is_competitive_bot(id)) return PLUGIN_HANDLED

        // FFA intentionally allows humans to switch physical T/CT sides at
        // any time so they can access either team's weapon shop. Logical team
        // identity and FFA scoring stay unchanged.
        new command[16]
        read_argv(0, command, charsmax(command))
        if (equal(command, "jointeam"))
        {
            new argument[8]
            read_argv(1, argument, charsmax(argument))
            new choice = str_to_num(argument)
            if (choice == 1) lockedTeam[id] = CS_TEAM_T
            else if (choice == 2) lockedTeam[id] = CS_TEAM_CT
            else if (choice != 5) return PLUGIN_HANDLED
        }
        return PLUGIN_CONTINUE
    }
    if (!is_competitive_bot(id)) return PLUGIN_HANDLED
    return PLUGIN_CONTINUE
}

public on_show_menu(messageId, messageDestination, id)
{
    if (!is_user_connected(id) || is_competitive_bot(id)) return PLUGIN_CONTINUE
    if (is_ffa_deathmatch()) return PLUGIN_CONTINUE

    new menuText[32]
    get_msg_arg_string(4, menuText, charsmax(menuText))
    if (equal(menuText, "#Team_Select") || equal(menuText, "#Terrorist_Select") || equal(menuText, "#CT_Select"))
        return PLUGIN_HANDLED

    return PLUGIN_CONTINUE
}

public on_vgui_menu(messageId, messageDestination, id)
{
    if (!is_user_connected(id) || is_competitive_bot(id)) return PLUGIN_CONTINUE
    if (is_ffa_deathmatch()) return PLUGIN_CONTINUE

    new menu = get_msg_arg_int(1)
    if (menu == 2 || menu == 26 || menu == 27) return PLUGIN_HANDLED

    return PLUGIN_CONTINUE
}

public on_text_message(messageId, messageDestination, id)
{
    new text[128], argumentCount = get_msg_args()
    for (new arg = 2; arg <= 4 && arg <= argumentCount; arg++)
    {
        get_msg_arg_string(arg, text, charsmax(text))
        if (containi(text, "#Game_welcome") != -1 || containi(text, "Welcome to") != -1)
            return PLUGIN_HANDLED
    }
    return PLUGIN_CONTINUE
}

public chat_command(id)
{
    if (!is_user_connected(id) || is_competitive_bot(id)) return PLUGIN_CONTINUE

    new message[192]
    read_args(message, charsmax(message))
    remove_quotes(message)
    trim(message)

    if (equali(message, "/report"))
        return report_command(id)

    // Keep stock chat immediate. The game worker translates only for opted-in
    // recipients and replies to this server through a bounded console command.
    if (message[0] && message[0] != '/' && !is_competitive_bot(id))
        queue_chat_translation(id, message)

    // Match observers join outside the authoritative player roster. Their
    // normal say should reach the whole server, but say_team should keep the
    // stock Counter-Strike spectator-only behavior.
    if (is_match_observer(id))
    {
        new command[16]
        read_argv(0, command, charsmax(command))
        if (equali(command, "say_team"))
            return PLUGIN_CONTINUE

        new name[32]
        get_user_name(id, name, charsmax(name))
        client_print(0, print_chat, "*SPEC* %s : %s", name, message)
        return PLUGIN_HANDLED
    }

    // CS 1.6 normally hides dead players' text from living players. Keep
    // stock delivery to dead players and copy team chat to living teammates,
    // or global chat to all living humans.
    new command[16]
    read_argv(0, command, charsmax(command))
    new teamChat = equali(command, "say_team") && !is_full_deathmatch()
    new globalChat = equali(command, "say")
    if ((teamChat || globalChat) && !is_user_alive(id) && message[0])
    {
        new CsTeams:side = cs_get_user_team(id)
        if (side == CS_TEAM_T || side == CS_TEAM_CT)
        {
            new name[32]
            get_user_name(id, name, charsmax(name))
            new maxPlayers = get_maxplayers()
            for (new target = 1; target <= maxPlayers; target++)
            {
                if (target == id || !is_user_connected(target) || !is_user_alive(target)
                    || is_competitive_bot(target)
                    || (teamChat && cs_get_user_team(target) != side)) continue
                if (globalChat)
                    client_print(target, print_chat, "*DEAD* %s : %s", name, message)
                else if (side == CS_TEAM_CT)
                    client_print(target, print_chat, "*DEAD*(Counter-Terrorist) %s : %s", name, message)
                else
                    client_print(target, print_chat, "*DEAD*(Terrorist) %s : %s", name, message)
            }
        }
    }

    return PLUGIN_CONTINUE
}

stock queue_chat_translation(sender, const message[])
{
    new command[16]
    read_argv(0, command, charsmax(command))
    new bool:teamChat = equali(command, "say_team") ? true : false
    if (!teamChat && !equali(command, "say")) return
    if (teamChat && (is_match_observer(sender) || is_full_deathmatch())) return

    chatTranslationSequence++
    if (chatTranslationSequence <= 0 || chatTranslationSequence > 100000000)
        chatTranslationSequence = 1
    new entry = chatTranslationSequence % 64
    chatTranslationEntry[entry] = chatTranslationSequence
    get_user_name(sender, chatTranslationName[entry], charsmax(chatTranslationName[]))

    new audience[512], audienceLength, senderTeam = _:cs_get_user_team(sender)
    new bool:senderAlive = is_user_alive(sender) ? true : false
    new maxPlayers = get_maxplayers()
    for (new target = 1; target <= 32; target++)
    {
        chatTranslationRecipients[entry][target] = 0
        if (target > maxPlayers || target == sender || !is_user_connected(target)
            || is_competitive_bot(target) || is_user_hltv(target)) continue
        if (teamChat && _:cs_get_user_team(target) != senderTeam) continue
        // Stock alive team chat does not reach dead teammates. Dead team chat
        // reaches living teammates through the existing explicit copy above.
        if (teamChat && senderAlive && !is_user_alive(target)) continue
        new userid = get_user_userid(target)
        if (userid <= 0) continue
        chatTranslationRecipients[entry][target] = userid
        audienceLength += formatex(audience[audienceLength], charsmax(audience) - audienceLength,
            "%d:%d,", target, userid)
    }
    if (!audienceLength) return

    new encoded[384], encodedLength
    for (new i = 0; message[i] && i < 180 && encodedLength < charsmax(encoded) - 2; i++)
        encodedLength += formatex(encoded[encodedLength], charsmax(encoded) - encodedLength,
            "%02x", message[i] & 0xff)

    new eventLog[160], matchId[81], eventLine[1024]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine),
        "{^"match_id^":^"%s^",^"type^":^"chat_translation_request^",^"sequence^":%d,^"userid^":%d,^"sent_at^":%d,^"audience^":^"%s^",^"text_hex^":^"%s^"}",
        matchId, chatTranslationSequence, sender, get_systime(), audience, encoded)
    write_file(eventLog, eventLine, -1)
}

public deliver_chat_translation()
{
    if (read_argc() != 5) return
    new sequenceArg[12], targetArg[4], useridArg[12], encoded[256]
    read_argv(1, sequenceArg, charsmax(sequenceArg))
    read_argv(2, targetArg, charsmax(targetArg))
    read_argv(3, useridArg, charsmax(useridArg))
    read_argv(4, encoded, charsmax(encoded))
    new sequence = str_to_num(sequenceArg), target = str_to_num(targetArg)
    new userid = str_to_num(useridArg)
    if (sequence <= 0 || target < 1 || target > get_maxplayers() || userid <= 0
        || !is_user_connected(target) || get_user_userid(target) != userid) return
    new entry = sequence % 64
    if (chatTranslationEntry[entry] != sequence || chatTranslationRecipients[entry][target] != userid) return
    new encodedLength = strlen(encoded)
    if (!encodedLength || encodedLength > 240 || encodedLength % 2) return
    new translated[121], first, second
    for (new i = 0; i < encodedLength / 2; i++)
    {
        first = hex_digit(encoded[i * 2])
        second = hex_digit(encoded[i * 2 + 1])
        if (first < 0 || second < 0) return
        translated[i] = (first << 4) | second
        if (translated[i] < 32 || translated[i] == 127) return
    }
    translated[encodedLength / 2] = 0
    chatTranslationRecipients[entry][target] = 0
    client_print(target, print_chat, "[Translated] %s : %s", chatTranslationName[entry], translated)
}

stock hex_digit(character)
{
    if (character >= '0' && character <= '9') return character - '0'
    if (character >= 'a' && character <= 'f') return character - 'a' + 10
    return -1
}

stock bool:is_match_observer(id)
{
    return ((playerRosterIndex[id] == 0 && logicalTeam[id] == 0)
        || logicalTeam[id] == 3)
        && cs_get_user_team(id) == CS_TEAM_SPECTATOR
}

public report_command(id)
{
    if (!is_user_connected(id) || is_competitive_bot(id)) return PLUGIN_HANDLED

    new reporter = playerRosterIndex[id] - 1
    if (reporter < 0 || reporter >= rosterCount)
    {
        client_print(id, print_chat, "[1.6 Competitive] Reports are only available to active match players.")
        return PLUGIN_HANDLED
    }

    reportTargetRoster[id] = -1
    reportTargetClient[id] = 0
    reportReasonIndex[id] = -1
    show_report_target_menu(id)
    return PLUGIN_HANDLED
}

stock show_report_target_menu(id)
{
    new reporter = playerRosterIndex[id] - 1
    if (reporter < 0 || reporter >= rosterCount) return

    new menu = menu_create("\yReport Player", "report_target_menu_handler")
    new info[8], label[64], playerName[32], available

    for (new targetId = 1; targetId <= 32; targetId++)
    {
        if (targetId == id || !is_user_connected(targetId) || is_user_hltv(targetId)) continue

        if (is_competitive_bot(targetId))
        {
            // Negative menu values encode bot client slots. They intentionally
            // use the same UI as humans and are discarded only on submission.
            num_to_str(-targetId, info, charsmax(info))
            get_user_name(targetId, playerName, charsmax(playerName))
            formatex(label, charsmax(label), "%s", playerName)
        }
        else
        {
            new target = playerRosterIndex[targetId] - 1
            if (target < 0 || target >= rosterCount || target == reporter || reportSubmitted[reporter][target])
                continue

            num_to_str(target, info, charsmax(info))
            formatex(label, charsmax(label), "%s", rosterNames[target])
        }

        menu_additem(menu, label, info)
        available++
    }

    if (!available)
    {
        menu_destroy(menu)
        client_print(id, print_chat, "[1.6 Competitive] No players are available to report.")
        return
    }

    menu_setprop(menu, MPROP_EXITNAME, "Cancel")
    menu_display(id, menu)
}

public report_target_menu_handler(id, menu, item)
{
    if (item == MENU_EXIT)
    {
        menu_destroy(menu)
        return PLUGIN_HANDLED
    }

    new info[8], label[64], access, callback
    menu_item_getinfo(menu, item, access, info, charsmax(info), label, charsmax(label), callback)
    menu_destroy(menu)

    new reporter = playerRosterIndex[id] - 1
    new target = str_to_num(info)

    if (target < 0)
    {
        new botId = -target
        if (botId < 1 || botId > 32 || !is_user_connected(botId) || !is_competitive_bot(botId))
            return PLUGIN_HANDLED

        reportTargetRoster[id] = -1
        reportTargetClient[id] = botId
        show_report_reason_menu(id)
        return PLUGIN_HANDLED
    }

    if (
        reporter < 0 || reporter >= rosterCount ||
        target < 0 || target >= rosterCount ||
        target == reporter
    )
        return PLUGIN_HANDLED

    if (reportSubmitted[reporter][target])
    {
        client_print(id, print_chat, "[1.6 Competitive] You already reported this player.")
        return PLUGIN_HANDLED
    }

    reportTargetRoster[id] = target
    reportTargetClient[id] = 0
    show_report_reason_menu(id)
    return PLUGIN_HANDLED
}

stock show_report_reason_menu(id)
{
    new target = reportTargetRoster[id]
    new targetClient = reportTargetClient[id]
    if ((target < 0 || target >= rosterCount) && targetClient == 0) return

    new title[96], targetName[32]
    if (
        targetClient > 0 &&
        targetClient <= 32 &&
        is_user_connected(targetClient) &&
        is_competitive_bot(targetClient)
    )
        get_user_name(targetClient, targetName, charsmax(targetName))
    else
        copy(targetName, charsmax(targetName), rosterNames[target])

    formatex(title, charsmax(title), "\yReport %s", targetName)
    new menu = menu_create(title, "report_reason_menu_handler")
    new info[8]

    for (new reason = 0; reason < sizeof REPORT_REASON_NAMES; reason++)
    {
        num_to_str(reason, info, charsmax(info))
        menu_additem(menu, REPORT_REASON_NAMES[reason], info)
    }

    menu_setprop(menu, MPROP_EXITNAME, "Cancel")
    menu_display(id, menu)
}

public report_reason_menu_handler(id, menu, item)
{
    if (item == MENU_EXIT)
    {
        menu_destroy(menu)
        reportTargetRoster[id] = -1
        reportTargetClient[id] = 0
        reportReasonIndex[id] = -1
        return PLUGIN_HANDLED
    }

    new info[8], label[64], access, callback
    menu_item_getinfo(menu, item, access, info, charsmax(info), label, charsmax(label), callback)
    menu_destroy(menu)

    new reason = str_to_num(info)
    if (reason < 0 || reason >= sizeof REPORT_REASON_NAMES)
    {
        reportTargetRoster[id] = -1
        reportTargetClient[id] = 0
        reportReasonIndex[id] = -1
        return PLUGIN_HANDLED
    }

    reportReasonIndex[id] = reason
    client_print(id, print_chat, "[1.6 Competitive] Describe what happened, then press Enter.")
    client_cmd(id, "messagemode 16c_report_description")
    return PLUGIN_HANDLED
}

public report_description_command(id)
{
    if (!is_user_connected(id) || is_competitive_bot(id)) return PLUGIN_HANDLED

    new reporter = playerRosterIndex[id] - 1
    new target = reportTargetRoster[id]
    new targetClient = reportTargetClient[id]
    new reason = reportReasonIndex[id]
    new bool:isBotTarget =
        targetClient > 0 &&
        targetClient <= 32 &&
        is_user_connected(targetClient) &&
        is_competitive_bot(targetClient)

    if (
        reporter < 0 || reporter >= rosterCount ||
        (!isBotTarget && (target < 0 || target >= rosterCount || target == reporter)) ||
        reason < 0 || reason >= sizeof REPORT_REASON_CODES
    )
    {
        reportTargetRoster[id] = -1
        reportTargetClient[id] = 0
        reportReasonIndex[id] = -1
        return PLUGIN_HANDLED
    }

    if (!isBotTarget && reportSubmitted[reporter][target])
    {
        client_print(id, print_chat, "[1.6 Competitive] You already reported this player.")
        reportTargetRoster[id] = -1
        reportTargetClient[id] = 0
        reportReasonIndex[id] = -1
        return PLUGIN_HANDLED
    }

    new description[MAX_REPORT_DESCRIPTION + 1]
    read_args(description, charsmax(description))
    remove_quotes(description)
    trim(description)

    if (strlen(description) < 3)
    {
        client_print(id, print_chat, "[1.6 Competitive] Please enter at least 3 characters.")
        client_cmd(id, "messagemode 16c_report_description")
        return PLUGIN_HANDLED
    }

    if (isBotTarget)
    {
        // Bot reports intentionally finish the normal UI flow but disappear
        // locally: no event, DB row, score change, or recording retention.
        reportTargetRoster[id] = -1
        reportTargetClient[id] = 0
        reportReasonIndex[id] = -1
        return PLUGIN_HANDLED
    }

    reportSubmitted[reporter][target] = true
    write_player_report_event(id, target, reason, description)
    client_print(
        id,
        print_chat,
        "[1.6 Competitive] Report request sent for %s.",
        rosterNames[target]
    )
    reportTargetRoster[id] = -1
    reportTargetClient[id] = 0
    reportReasonIndex[id] = -1
    return PLUGIN_HANDLED
}

stock write_player_report_event(id, targetRosterIndex, reasonIndex, const description[])
{
    new reporterName[32], safeReporter[64], safeTarget[64], safeDescription[MAX_REPORT_DESCRIPTION + 1]
    get_user_name(id, reporterName, charsmax(reporterName))

    copy(safeReporter, charsmax(safeReporter), reporterName)
    copy(safeTarget, charsmax(safeTarget), rosterNames[targetRosterIndex])
    copy(safeDescription, charsmax(safeDescription), description)

    replace_all(safeReporter, charsmax(safeReporter), "\\", "\\\\")
    replace_all(safeTarget, charsmax(safeTarget), "\\", "\\\\")
    replace_all(safeDescription, charsmax(safeDescription), "\\", "\\\\")
    replace_all(safeReporter, charsmax(safeReporter), "^"", "'")
    replace_all(safeTarget, charsmax(safeTarget), "^"", "'")
    replace_all(safeDescription, charsmax(safeDescription), "^"", "'")

    new eventLog[160], matchId[81], eventLine[768]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(
        eventLine,
        charsmax(eventLine),
        "{^"match_id^":^"%s^",^"type^":^"player_report^",^"userid^":%d,^"reporter_name^":^"%s^",^"target_name^":^"%s^",^"reason^":^"%s^",^"description^":^"%s^",^"round^":%d}",
        matchId,
        id,
        safeReporter,
        safeTarget,
        REPORT_REASON_CODES[reasonIndex],
        safeDescription,
        roundsPlayed + 1
    )
    write_file(eventLog, eventLine, -1)
}

public kill_bots_command(id)
{
    if (!get_cvar_num("competitive_dev_commands")) return PLUGIN_CONTINUE

    if (get_cvar_pointer("yb_quota")) server_cmd("yb killbots")
    else server_cmd("bot_kill")
    server_exec()
    client_print(id, print_chat, "[1.6 Competitive] YaPB kill command sent.")
    return PLUGIN_HANDLED
}

// CS 1.6 match manifests can contain several skins for the same weapon.
// Roll once per weapon and choose one of its available variants for this bot.
stock assign_bot_skins(id)
{
    new chance = get_cvar_num("competitive_bot_skin_chance")
    if (chance < 0) chance = 0
    else if (chance > 100) chance = 100

    for (new index = 0; index < skinCount; index++)
    {
        new bool:seenWeapon = false
        for (new previous = 0; previous < index; previous++)
            if (skinBotPool[previous] && equal(skinWeapons[index], skinWeapons[previous]))
            {
                seenWeapon = true
                break
            }
        if (!skinBotPool[index] || seenWeapon || random_num(1, 100) > chance) continue

        new variantCount = 0
        for (new variant = index; variant < skinCount; variant++)
            if (skinBotPool[variant] && equal(skinWeapons[index], skinWeapons[variant])) variantCount++

        new selectedVariant = random_num(0, variantCount - 1)
        for (new variant = index; variant < skinCount; variant++)
        {
            if (!skinBotPool[variant] || !equal(skinWeapons[index], skinWeapons[variant])) continue
            if (selectedVariant-- == 0)
            {
                botSkinChoices[id][index] = variant + 1
                break
            }
        }
    }
}

stock find_player_weapon_skin(id, const weapon[])
{
    if (is_competitive_bot(id))
    {
        for (new index = 0; index < skinCount; index++)
            if (botSkinChoices[id][index] && equal(weapon, skinWeapons[index]))
                return botSkinChoices[id][index] - 1
        return -1
    }

    new joinToken[65]
    get_match_join_token(id, joinToken, charsmax(joinToken))
    new playerName[32]
    get_user_name(id, playerName, charsmax(playerName))

    for (new index = 0; index < skinCount; index++)
        if (!skinBotPool[index] && (equal(joinToken, skinTokens[index]) || equal(playerName, skinPlayerNames[index])) && equal(weapon, skinWeapons[index]))
            return index
    return -1
}

stock bool:skin_debug_enabled()
{
    return get_cvar_num("competitive_dev_commands") != 0
}

stock skin_debug_player(id, const action[])
{
    if (!skin_debug_enabled()) return

    new name[32]
    get_user_name(id, name, charsmax(name))
    server_print("[1.6 Competitive][SkinDebug] player %s id=%d bot=%d name=%s follower=%d", action, id, is_user_bot(id), name, skinPlayerModelEntities[id])
}

stock manual_roster_index(const manualToken[])
{
    new file = fopen("competitive_manual_connections.txt", "rt")
    if (!file) return -1
    new line[150], allowedToken[65], rosterToken[65], matched = -1
    while (!feof(file))
    {
        fgets(file, line, charsmax(line))
        parse(line, allowedToken, charsmax(allowedToken), rosterToken, charsmax(rosterToken))
        if (!equal(manualToken, allowedToken)) continue
        for (new i = 0; i < rosterCount; i++)
            if (equal(rosterToken, rosterTokens[i]))
            {
                matched = i
                break
            }
        break
    }
    fclose(file)
    return matched
}

stock token_fingerprint(const token[], output[], outputLength)
{
    if (!token[0])
    {
        copy(output, outputLength, "none")
        return
    }
    new digest[65]
    hash_string(token, Hash_Sha256, digest, charsmax(digest))
    strtolower(digest)
    copy(output, outputLength, digest)
}

stock get_match_join_info_key(output[], outputLength)
{
    new matchId[81], digest[65]
    get_cvar_string("competitive_match_id", matchId, charsmax(matchId))
    hash_string(matchId, Hash_Sha256, digest, charsmax(digest))
    strtolower(digest)
    digest[16] = 0
    formatex(output, outputLength, "_16c_%s", digest)
}

stock get_match_join_token(id, output[], outputLength)
{
    new key[22]
    get_match_join_info_key(key, charsmax(key))
    get_user_info(id, key, output, outputLength)
    // Older launcher builds use the fixed key. The match-specific value takes
    // precedence when both are present, so a saved old _16c cannot override it.
    if (!output[0]) get_user_info(id, "_16c", output, outputLength)
}

stock write_ai_bot_identity_map()
{
    // The bundled CS 1.6 YaPB 4.5.1 AI bridge uses zero-based client slots;
    // AMXX ids are one-based. Verify this mapping for other YaPB builds.
    // Keep this instance-local file separate from YaPB's event log.
    new path[192]
    get_datadir(path, charsmax(path))
    add(path, charsmax(path), "/16c_ai_bot_identity.txt")
    new file = fopen(path, "wt")
    if (!file) return
    for (new id = 1; id <= 32; id++)
    {
        if (!is_user_connected(id) || !aiBotNames[id][0]) continue
        fprintf(file, "%d %s %s %s %s^n", id - 1, aiBotNames[id], aiBotPersonalities[id], aiBotCountries[id], aiBotChatStyles[id])
    }
    fclose(file)
}

stock assign_ai_bot_identity(id, team, index)
{
    copy(aiBotNames[id], charsmax(aiBotNames[]), botNames[team][index])
    copy(aiBotPersonalities[id], charsmax(aiBotPersonalities[]), botPersonalities[team][index])
    copy(aiBotCountries[id], charsmax(aiBotCountries[]), botCountries[team][index])
    copy(aiBotChatStyles[id], charsmax(aiBotChatStyles[]), botChatStyles[team][index])
    write_ai_bot_identity_map()
}

stock find_logical_team(id)
{
    if (is_competitive_bot(id))
    {
        for (new team = 1; team <= 2; team++)
        {
            if (botAssigned[team] >= botSlots[team]) continue
            for (new index = 0; index < botSlots[team]; index++)
            {
                // A bot can leave from the middle of a fixed roster. Reuse
                // its identity instead of assigning the final name twice.
                if (bot_identity_in_use(team, index)) continue
                botAssigned[team]++
                set_user_info(id, "name", botNames[team][index])
                assign_ai_bot_identity(id, team, index)
                return team
            }
        }

        return 0
    }
    new joinToken[65]
    get_match_join_token(id, joinToken, charsmax(joinToken))
    for (new i = 0; i < rosterCount; i++)
    {
        if (equal(joinToken, rosterTokens[i]))
        {
            set_user_info(id, "name", rosterNames[i])
            playerRosterIndex[id] = i + 1
            restore_player_state(id)
            return rosterTeams[i]
        }
    }
    if (equal(joinToken, "m_", 2))
    {
        new manualIndex = manual_roster_index(joinToken)
        if (manualIndex < 0) return 0
        set_user_info(id, "name", rosterNames[manualIndex])
        playerRosterIndex[id] = manualIndex + 1
        restore_player_state(id)
        return rosterTeams[manualIndex]
    }
    // A supplied but expired token must not bypass validation by matching a
    // player name or recently observed IP. Wait for the current token instead.
    if (joinToken[0]) return 0

    new playerName[32]
    get_user_name(id, playerName, charsmax(playerName))
    for (new i = 0; i < rosterCount; i++)
        if (equal(playerName, rosterNames[i]))
        {
            playerRosterIndex[id] = i + 1
            restore_player_state(id)
            return rosterTeams[i]
        }

    // Last-resort association for clients that failed to retain _16c. The
    // backend only supplies addresses observed within the last hour and
    // removes addresses shared by multiple humans in this match. Recheck
    // uniqueness here so a malformed config can never choose arbitrarily.
    new playerIp[46], matchedRoster = -1
    get_user_ip(id, playerIp, charsmax(playerIp), 1)
    for (new i = 0; i < rosterCount; i++)
    {
        if (!rosterIps[i][0] || !equal(playerIp, rosterIps[i])) continue
        if (matchedRoster != -1) return 0
        matchedRoster = i
    }
    if (matchedRoster != -1)
    {
        set_user_info(id, "name", rosterNames[matchedRoster])
        playerRosterIndex[id] = matchedRoster + 1
        restore_player_state(id)
        return rosterTeams[matchedRoster]
    }
    return 0
}

stock bool:bot_identity_in_use(team, index)
{
    for (new player = 1; player <= 32; player++)
    {
        if (!is_user_connected(player) || logicalTeam[player] != team || !is_competitive_bot(player)) continue
        if (equal(aiBotNames[player], botNames[team][index])) return true
    }
    return false
}

stock save_player_state(id)
{
    new rosterIndex = playerRosterIndex[id] - 1
    if (rosterIndex < 0 || rosterIndex >= rosterCount) return

    rosterKills[rosterIndex] = playerKills[id]
    rosterDeaths[rosterIndex] = playerDeaths[id]
    rosterAssists[rosterIndex] = playerAssists[id]
    rosterHeadshots[rosterIndex] = playerHeadshots[id]
    rosterDamage[rosterIndex] = playerDamage[id]
    rosterGrenadeKills[rosterIndex] = playerGrenadeKills[id]
    rosterMoney[rosterIndex] = cs_get_user_money(id)
    rosterMoneyValid[rosterIndex] = true
    save_player_round_state(id, rosterIndex)
}

stock save_player_round_state(id, rosterIndex)
{
    rosterRoundStateValid[rosterIndex] = true
    rosterRoundSerial[rosterIndex] = roundSerial
    rosterWasAlive[rosterIndex] = !roundEnding && is_user_alive(id)
    rosterWeaponCount[rosterIndex] = 0
    rosterActiveWeapon[rosterIndex] = 0

    for (new weaponId = 0; weaponId <= MAX_CS_WEAPON_ID; weaponId++)
        rosterBpAmmo[rosterIndex][weaponId] = 0
    for (new slot = 0; slot < MAX_RECONNECT_WEAPONS; slot++)
    {
        rosterWeaponIds[rosterIndex][slot] = 0
        rosterWeaponClips[rosterIndex][slot] = -1
        rosterWeaponSkinMarkers[rosterIndex][slot] = 0
    }

    if (!rosterWasAlive[rosterIndex]) return

    rosterHealth[rosterIndex] = get_user_health(id)
    rosterArmor[rosterIndex] = cs_get_user_armor(id, rosterArmorType[rosterIndex])
    rosterActiveWeapon[rosterIndex] = get_user_weapon(id)

    new weapons[MAX_RECONNECT_WEAPONS], weaponCount
    get_user_weapons(id, weapons, weaponCount)
    for (new i = 0; i < weaponCount && rosterWeaponCount[rosterIndex] < MAX_RECONNECT_WEAPONS; i++)
    {
        new weaponId = weapons[i]
        if (weaponId <= 0 || weaponId > MAX_CS_WEAPON_ID || weaponId == CSW_C4) continue

        new weaponName[32]
        if (!get_weaponname(weaponId, weaponName, charsmax(weaponName))) continue

        new snapshot = rosterWeaponCount[rosterIndex]++
        rosterWeaponIds[rosterIndex][snapshot] = weaponId
        if (weaponId != CSW_KNIFE)
            rosterBpAmmo[rosterIndex][weaponId] = cs_get_user_bpammo(id, weaponId)

        new weaponEntity = rg_find_weapon_bpack_by_name(id, weaponName)
        if (weaponEntity > 0)
        {
            rosterWeaponClips[rosterIndex][snapshot] = get_member(weaponEntity, m_Weapon_iClip)
            rosterWeaponSkinMarkers[rosterIndex][snapshot] = pev(weaponEntity, pev_iuser4)
        }
    }
}

stock restore_player_state(id)
{
    new rosterIndex = playerRosterIndex[id] - 1
    if (rosterIndex < 0 || rosterIndex >= rosterCount) return

    playerKills[id] = rosterKills[rosterIndex]
    playerDeaths[id] = rosterDeaths[rosterIndex]
    playerAssists[id] = rosterAssists[rosterIndex]
    playerHeadshots[id] = rosterHeadshots[rosterIndex]
    playerDamage[id] = rosterDamage[rosterIndex]
    playerGrenadeKills[id] = rosterGrenadeKills[rosterIndex]

    // FFA has no next round to release a reconnecting dead player. Restore
    // their match totals/money, but never carry round survival restrictions.
    new bool:sameRoundState = !is_full_deathmatch() && rosterRoundStateValid[rosterIndex] && rosterRoundSerial[rosterIndex] == roundSerial
    restoreRoundStateOnSpawn[id] = sameRoundState && rosterWasAlive[rosterIndex]
    suppressReconnectRespawn[id] = sameRoundState && !rosterWasAlive[rosterIndex]
    restoreMoneyOnSpawn[id] = rosterMoneyValid[rosterIndex]
}

stock restore_saved_money_now(id)
{
    if (!restoreMoneyOnSpawn[id] || playerRosterIndex[id] <= 0) return

    new rosterIndex = playerRosterIndex[id] - 1
    if (rosterIndex >= 0 && rosterIndex < rosterCount && rosterMoneyValid[rosterIndex])
        cs_set_user_money(id, rosterMoney[rosterIndex], 1)
    restoreMoneyOnSpawn[id] = false
}

stock restore_player_round_state(id)
{
    if (!restoreRoundStateOnSpawn[id] || playerRosterIndex[id] <= 0 || !is_user_alive(id)) return

    new rosterIndex = playerRosterIndex[id] - 1
    if (rosterIndex < 0 || rosterIndex >= rosterCount || !rosterRoundStateValid[rosterIndex] || rosterRoundSerial[rosterIndex] != roundSerial || !rosterWasAlive[rosterIndex])
    {
        restoreRoundStateOnSpawn[id] = false
        return
    }

    rg_remove_all_items(id, false)
    cs_set_user_defuse(id, 0)

    new bool:restoredKnife
    for (new i = 0; i < rosterWeaponCount[rosterIndex]; i++)
    {
        new weaponId = rosterWeaponIds[rosterIndex][i]
        if (weaponId <= 0 || weaponId > MAX_CS_WEAPON_ID || weaponId == CSW_C4) continue

        new weaponName[32]
        if (!get_weaponname(weaponId, weaponName, charsmax(weaponName))) continue
        new weaponEntity = rg_give_item(id, weaponName)
        if (weaponEntity > 0)
        {
            if (weaponId == CSW_KNIFE)
                restoredKnife = true
            if (rosterWeaponClips[rosterIndex][i] >= 0)
                set_member(weaponEntity, m_Weapon_iClip, rosterWeaponClips[rosterIndex][i])
            set_pev(weaponEntity, pev_iuser4, rosterWeaponSkinMarkers[rosterIndex][i])
        }
        if (weaponId != CSW_KNIFE)
            cs_set_user_bpammo(id, weaponId, rosterBpAmmo[rosterIndex][weaponId])
    }

    // The engine can omit its default melee weapon while the disconnecting
    // player's inventory is being enumerated. A live CS 1.6 player must always
    // retain a knife even though all other weapons come from the snapshot.
    if (!restoredKnife)
        rg_give_item(id, "weapon_knife")

    set_user_health(id, rosterHealth[rosterIndex])
    cs_set_user_armor(id, rosterArmor[rosterIndex], rosterArmorType[rosterIndex])

    new activeWeapon = rosterActiveWeapon[rosterIndex]
    if (activeWeapon > 0 && activeWeapon <= MAX_CS_WEAPON_ID && activeWeapon != CSW_C4)
    {
        new activeWeaponName[32]
        if (get_weaponname(activeWeapon, activeWeaponName, charsmax(activeWeaponName)))
            engclient_cmd(id, activeWeaponName)
    }

    restoreRoundStateOnSpawn[id] = false
}

stock bool:is_ffa_deathmatch()
{
    return get_cvar_num("competitive_game_mode") == GAME_MODE_DEATHMATCH
}

stock bool:is_fight_yard()
{
    return get_cvar_num("competitive_game_mode") == GAME_MODE_FIGHT_YARD
}

stock bool:is_full_deathmatch()
{
    return is_ffa_deathmatch() || is_fight_yard()
}

stock bool:is_deathmatch_active()
{
    if (is_full_deathmatch()) return true
    return !matchLive && !matchStarting && !swappingSides
}

stock bool:is_deathmatch_consumable(weaponId)
{
    return weaponId == CSW_HEGRENADE ||
        weaponId == CSW_FLASHBANG ||
        weaponId == CSW_SMOKEGRENADE
}

public on_ffa_weapon_frame_post(weaponEntity)
{
    // ReGameDLL transfers reserve ammo into the clip during ItemPostFrame.
    // Restore the reserve afterward so FFA reloads never spend magazines.
    if (!is_full_deathmatch()) return

    new id = get_member(weaponEntity, m_pPlayer)
    if (id < 1 || id > 32 || !is_user_alive(id)) return

    new weaponId = get_member(weaponEntity, m_iId)
    if (weaponId <= 0 || weaponId > MAX_CS_WEAPON_ID ||
        weaponId == CSW_KNIFE || weaponId == CSW_C4 || is_deathmatch_consumable(weaponId)) return

    new maxAmmo = rg_get_iteminfo(weaponEntity, ItemInfo_iMaxAmmo1)
    if (maxAmmo > 0 && cs_get_user_bpammo(id, weaponId) < maxAmmo)
        cs_set_user_bpammo(id, weaponId, maxAmmo)
}

stock clear_deathmatch_consumable_entitlements(id)
{
    deathmatchConsumableCount[id][CSW_HEGRENADE] = 0
    deathmatchConsumableCount[id][CSW_FLASHBANG] = 0
    deathmatchConsumableCount[id][CSW_SMOKEGRENADE] = 0
}

stock track_deathmatch_consumable(id, weaponId)
{
    if (!is_user_connected(id) || !is_deathmatch_active() || !is_deathmatch_consumable(weaponId)) return

    new count = cs_get_user_bpammo(id, weaponId)
    if (count <= 0 && user_has_weapon(id, weaponId))
        count = 1

    if (count > deathmatchConsumableCount[id][weaponId])
        deathmatchConsumableCount[id][weaponId] = count
}

stock restore_deathmatch_consumables(id)
{
    new consumables[] = { CSW_HEGRENADE, CSW_FLASHBANG, CSW_SMOKEGRENADE }
    for (new i = 0; i < sizeof(consumables); i++)
    {
        new weaponId = consumables[i]
        new count = deathmatchConsumableCount[id][weaponId]
        if (count <= 0) continue

        if (!user_has_weapon(id, weaponId))
        {
            new weaponName[32]
            if (get_weaponname(weaponId, weaponName, charsmax(weaponName)))
                rg_give_item(id, weaponName)
        }

        // Restore the largest count this player actually acquired. For example,
        // one purchased flash comes back as one; two purchased flashes come back as two.
        cs_set_user_bpammo(id, weaponId, count)
    }
}

stock give_ffa_spawn_consumables(id)
{
    if (!is_ffa_deathmatch() || !is_user_alive(id)) return

    new consumables[] = { CSW_HEGRENADE, CSW_FLASHBANG, CSW_SMOKEGRENADE }
    new counts[] = { 1, 2, 1 }
    for (new i = 0; i < sizeof(consumables); i++)
    {
        new weaponId = consumables[i]
        if (!user_has_weapon(id, weaponId))
        {
            new weaponName[32]
            if (get_weaponname(weaponId, weaponName, charsmax(weaponName)))
                rg_give_item(id, weaponName)
        }
        cs_set_user_bpammo(id, weaponId, counts[i])
        deathmatchConsumableCount[id][weaponId] = counts[i]
    }
}

stock refill_deathmatch_ammo(id, weaponId, weaponEntity)
{
    if (weaponId == CSW_KNIFE || is_deathmatch_consumable(weaponId)) return

    new maxClip = rg_get_iteminfo(weaponEntity, ItemInfo_iMaxClip)
    if (maxClip > 0)
        set_member(weaponEntity, m_Weapon_iClip, maxClip)

    new maxAmmo = rg_get_iteminfo(weaponEntity, ItemInfo_iMaxAmmo1)
    if (maxAmmo > 0)
        cs_set_user_bpammo(id, weaponId, maxAmmo)
}

stock give_ffa_bot_random_loadout(id)
{
    if (!is_full_deathmatch() || !is_competitive_bot(id) || !is_user_alive(id)) return

    // FFA respawns happen too quickly to rely on YaPB's normal buy timing.
    // Give bots a fresh combat-ready loadout directly on every spawn.
    rg_remove_all_items(id, false)
    cs_set_user_defuse(id, 0)

    rg_give_item(id, "weapon_knife")

    new pistolName[24]
    if (cs_get_user_team(id) == CS_TEAM_CT)
        copy(pistolName, charsmax(pistolName), "weapon_usp")
    else
        copy(pistolName, charsmax(pistolName), "weapon_glock18")

    new pistolId = get_weaponid(pistolName)
    new pistolEntity = rg_give_item(id, pistolName)
    if (pistolEntity > 0)
        refill_deathmatch_ammo(id, pistolId, pistolEntity)

    new const primaryWeapons[][] = {
        "weapon_ak47",
        "weapon_m4a1",
        "weapon_galil",
        "weapon_famas",
        "weapon_aug",
        "weapon_sg552",
        "weapon_mp5navy",
        "weapon_p90",
        "weapon_ump45",
        "weapon_m3",
        "weapon_xm1014",
        "weapon_scout",
        "weapon_awp"
    }

    new selected = random_num(0, sizeof(primaryWeapons) - 1)
    new primaryId = get_weaponid(primaryWeapons[selected])
    new primaryEntity = rg_give_item(id, primaryWeapons[selected])
    if (primaryEntity > 0)
    {
        refill_deathmatch_ammo(id, primaryId, primaryEntity)
        engclient_cmd(id, primaryWeapons[selected])
    }
}


stock set_deathmatch_money(id)
{
    if (!is_user_connected(id) || !is_deathmatch_active()) return

    new CsTeams:team = cs_get_user_team(id)
    if (team != CS_TEAM_T && team != CS_TEAM_CT) return

    new warmupMoney = get_cvar_num("mp_maxmoney")
    if (warmupMoney <= 0) warmupMoney = 16000
    if (cs_get_user_money(id) == warmupMoney) return

    deathmatchMoneyUpdating[id] = true
    cs_set_user_money(id, warmupMoney, 1)
    deathmatchMoneyUpdating[id] = false
}

public on_account_change_post(id, amount, rewardType, bool:trackChange)
{
    if (id < 1 || id > 32 || deathmatchMoneyUpdating[id] || !is_deathmatch_active()) return
    if (is_fight_yard())
    {
        deathmatchMoneyUpdating[id] = true
        cs_set_user_money(id, 0, 1)
        deathmatchMoneyUpdating[id] = false
        return
    }
    set_deathmatch_money(id)
}

public on_give_named_item_post(id, const itemName[])
{
    if (id < 1 || id > 32 || !is_deathmatch_active()) return

    new weaponId = get_weaponid(itemName)
    track_deathmatch_consumable(id, weaponId)
}

stock clear_deathmatch_loadout(id)
{
    deathmatchLoadoutValid[id] = false
    deathmatchActiveWeapon[id] = 0
    deathmatchWeaponCount[id] = 0

    for (new weaponId = 0; weaponId <= MAX_CS_WEAPON_ID; weaponId++)
        deathmatchBpAmmo[id][weaponId] = 0
    for (new slot = 0; slot < MAX_RECONNECT_WEAPONS; slot++)
    {
        deathmatchWeaponIds[id][slot] = 0
        deathmatchWeaponClips[id][slot] = -1
        deathmatchWeaponSkinMarkers[id][slot] = 0
    }
}

stock clear_all_deathmatch_loadouts()
{
    for (new id = 1; id <= 32; id++)
    {
        deathmatchLoadoutValid[id] = false
        deathmatchActiveWeapon[id] = 0
        deathmatchWeaponCount[id] = 0
        deathmatchMoneyUpdating[id] = false
        clear_deathmatch_consumable_entitlements(id)
    }
}

stock save_deathmatch_loadout(id)
{
    // Called from the pre-Killed hook: lethal damage has already reduced
    // health to zero, but the engine has not dropped the inventory yet.
    // is_user_alive would reject precisely the death we need to snapshot.
    if (!is_deathmatch_active() || !is_user_connected(id)) return
    if (is_user_hltv(id) || is_aimbot_detection_probe(id)) return
    if (logicalTeam[id] != 1 && logicalTeam[id] != 2) return
    clear_deathmatch_loadout(id)

    deathmatchActiveWeapon[id] = get_user_weapon(id)

    new weapons[MAX_RECONNECT_WEAPONS], weaponCount
    get_user_weapons(id, weapons, weaponCount)
    for (new i = 0; i < weaponCount && deathmatchWeaponCount[id] < MAX_RECONNECT_WEAPONS; i++)
    {
        new weaponId = weapons[i]
        if (weaponId <= 0 || weaponId > MAX_CS_WEAPON_ID || weaponId == CSW_C4) continue

        new weaponName[32]
        if (!get_weaponname(weaponId, weaponName, charsmax(weaponName))) continue

        new snapshot = deathmatchWeaponCount[id]++
        deathmatchWeaponIds[id][snapshot] = weaponId
        if (weaponId != CSW_KNIFE)
            deathmatchBpAmmo[id][weaponId] = cs_get_user_bpammo(id, weaponId)

        new weaponEntity = rg_find_weapon_bpack_by_name(id, weaponName)
        if (weaponEntity > 0)
        {
            deathmatchWeaponClips[id][snapshot] = get_member(weaponEntity, m_Weapon_iClip)
            deathmatchWeaponSkinMarkers[id][snapshot] = pev(weaponEntity, pev_iuser4)
        }
    }

    deathmatchLoadoutValid[id] = deathmatchWeaponCount[id] > 0
}

stock restore_deathmatch_loadout(id)
{
    if (!deathmatchLoadoutValid[id] || !is_deathmatch_active() || !is_user_alive(id)) return

    rg_remove_all_items(id, false)
    cs_set_user_defuse(id, 0)

    new bool:restoredKnife
    for (new i = 0; i < deathmatchWeaponCount[id]; i++)
    {
        new weaponId = deathmatchWeaponIds[id][i]
        if (weaponId <= 0 || weaponId > MAX_CS_WEAPON_ID || weaponId == CSW_C4) continue

        new weaponName[32]
        if (!get_weaponname(weaponId, weaponName, charsmax(weaponName))) continue

        new weaponEntity = rg_give_item(id, weaponName)
        if (weaponEntity > 0)
        {
            if (weaponId == CSW_KNIFE)
                restoredKnife = true

            if (is_deathmatch_consumable(weaponId))
            {
                // The snapshot restores the weapon entity immediately. The
                // entitlement pass below then replenishes the amount the player bought.
                if (deathmatchWeaponClips[id][i] >= 0)
                    set_member(weaponEntity, m_Weapon_iClip, deathmatchWeaponClips[id][i])
            }
            else
            {
                // Guns keep their weapon/skin, but every death refreshes bullets.
                refill_deathmatch_ammo(id, weaponId, weaponEntity)
            }

            set_pev(weaponEntity, pev_iuser4, deathmatchWeaponSkinMarkers[id][i])
        }

        if (is_deathmatch_consumable(weaponId))
            cs_set_user_bpammo(id, weaponId, deathmatchBpAmmo[id][weaponId])
    }

    // Grenades are a purchased deathmatch loadout choice. Even if they were
    // thrown before death and therefore absent from the death snapshot, respawn
    // restores the amount the player had acquired during this deathmatch.
    restore_deathmatch_consumables(id)

    if (!restoredKnife)
        rg_give_item(id, "weapon_knife")

    new activeWeapon = deathmatchActiveWeapon[id]
    if (activeWeapon > 0 && activeWeapon <= MAX_CS_WEAPON_ID && activeWeapon != CSW_C4)
    {
        new activeWeaponName[32]
        if (get_weaponname(activeWeapon, activeWeaponName, charsmax(activeWeaponName)))
            engclient_cmd(id, activeWeaponName)
    }

    schedule_skin_reapply(id)
}

stock bool:is_aimbot_detection_probe(id)
{
    if (id < 1 || id > 32 || !is_user_bot(id)) return false
    new name[16]
    get_user_name(id, name, charsmax(name))
    return bool:equal(name, "16c_ad_", 7)
}

stock bool:is_competitive_bot(id)
{
    if (is_user_bot(id)) return true
    new authId[32]
    get_user_authid(id, authId, charsmax(authId))
    return bool:equal(authId, "BOT")
}

stock apply_player_side(id, bool:completeJoin = false)
{
    new CsTeams:side = physical_side_for_logical(logicalTeam[id])
    new bool:waitingForNextRound = suppressReconnectRespawn[id]

    new teamArgument[2]
    if (side == CS_TEAM_T) copy(teamArgument, charsmax(teamArgument), "1")
    else copy(teamArgument, charsmax(teamArgument), "2")

    if (waitingForNextRound)
    {
        // A player who died this round must not respawn on reconnect. Enter
        // through the real spectator path so GoldSrc initializes the observer
        // HUD and controls; return to the roster side at the next round.
        rg_join_team(id, TEAM_SPECTATOR)
        rg_set_observer_mode(id, OBS_IN_EYE)
        suppressReconnectRespawn[id] = true
    }
    else if (swappingSides && !completeJoin)
    {
        rg_set_user_team(id, TeamName:side, MODEL_AUTO, true, false)
    }
    else if (is_full_deathmatch() && !is_competitive_bot(id))
    {
        // JoinTeam sets GETINTOGAME. Let JoiningThink/GetIntoGame finish the
        // entry lifecycle: it clears m_bJustConnected/m_bNotKilled and gives
        // the initial loadout. Forcing JOINED here skips that initialization.
        performingAutoAssignment[id] = true
        rg_join_team(id, TeamName:side)
        rg_set_user_team(id, TeamName:side, MODEL_AUTO, true, false)
        set_member(id, m_iMenu, Menu_OFF)
        performingAutoAssignment[id] = false
    }
    else
    {
        performingAutoAssignment[id] = true
        engclient_cmd(id, "jointeam", teamArgument)
        engclient_cmd(id, "joinclass", "1")
        performingAutoAssignment[id] = false
        cs_set_user_team(id, side)
    }
    lockedTeam[id] = side
    show_menu(id, 0, "^n", 1)
    remove_task(TASK_RESPAWN + id)
    if ((!swappingSides || completeJoin) && !waitingForNextRound)
        set_task(0.2, "respawn_assigned_player", TASK_RESPAWN + id)
    else if (waitingForNextRound)
        restore_saved_money_now(id)
}

stock CsTeams:physical_side_for_logical(team)
{
    if (is_ffa_deathmatch()) return CS_TEAM_T

    new bool:teamAOnT = teamAStartsTerrorist
    if (sidesSwapped) teamAOnT = !teamAOnT

    if ((team == 1 && teamAOnT) || (team == 2 && !teamAOnT)) return CS_TEAM_T
    return CS_TEAM_CT
}

stock logical_team_for_side(CsTeams:side)
{
    return side == physical_side_for_logical(1) ? 1 : 2
}

public respawn_assigned_player(taskId)
{
    new id = taskId - TASK_RESPAWN
    if (!is_user_connected(id) || is_user_alive(id) || suppressReconnectRespawn[id]) return
    if (matchTerminated || ffaFinished || is_user_hltv(id) || is_aimbot_detection_probe(id)) return
    if (logicalTeam[id] != 1 && logicalTeam[id] != 2) return
    // Never race the normal engine join with a forced first spawn. Humans can
    // leave the class menu open for longer than a fixed retry window, so keep
    // waiting until the normal join finishes or the match/player goes away.
    if (is_full_deathmatch() && get_member(id, m_iJoiningState) != JOINED)
    {
        set_task(0.5, "respawn_assigned_player", TASK_RESPAWN + id)
        return
    }
    new CsTeams:team = cs_get_user_team(id)
    if (team == CS_TEAM_T || team == CS_TEAM_CT)
        ExecuteHamB(Ham_CS_RoundRespawn, id)
}

stock check_match_ready()
{
    if (matchLive || matchStarting || ffaFinished) return
    new expected = rosterCount + botSlots[1] + botSlots[2]
    new assigned
    for (new id = 1; id <= 32; id++)
    {
        if (!is_user_connected(id) || logicalTeam[id] == 0) continue
        // A human choosing an FFA side is roster-assigned but not ready until
        // the normal team/class join lifecycle has reached JOINED.
        if (is_full_deathmatch() && get_member(id, m_iJoiningState) != JOINED) continue
        assigned++
    }
    if (expected == 0 || assigned < expected) return

    matchStarting = true
    clear_all_deathmatch_loadouts()
    client_print(0, print_chat, "[1.6 Competitive] All players connected. Match starts in 5 seconds.")
    write_event_number("match_starting", assigned)
    set_task(0.1, "restart_for_live_match")
}

public restart_for_live_match()
{
    if (matchTerminated) return
    server_cmd("sv_restart %d", LIVE_RESTART_SECONDS)
    server_exec()
    set_task(LIVE_RESTART_TASK_DELAY, "begin_live_match")
}

public begin_live_match()
{
    if (matchTerminated) return
    if (matchLive || swappingSides) return
    matchLive = true
    matchStarting = false
    ffaFinished = false
    ffaMilestone30Announced = false
    ffaMilestone10Announced = false
    ffaMilestone3Announced = false
    clear_all_deathmatch_loadouts()
    roundsPlayed = 0
    roundWinners[0] = 0
    roundEvents[0] = 0
    currentRoundEvent = 'U'
    logicalScore[1] = 0
    logicalScore[2] = 0
    roundEnding = false
    winTarget = get_cvar_num("competitive_rounds_to_win")
    sync_public_match_score()
    refresh_server_name()
    write_event_number("match_live", winTarget)
    client_print(0, print_chat, "[1.6 Competitive] Match is live. Good luck, have fun!")
}

// Preserve engine-controlled health/weapon visibility, including death and
// spectator states. FFA suppresses only the timer bit/messages.
public on_ffa_hide_weapon(messageId, messageDestination, id)
{
    if (is_full_deathmatch())
        set_msg_arg_int(1, ARG_BYTE, get_msg_arg_int(1) | HIDEHUD_TIMER)
    return PLUGIN_CONTINUE
}

public on_ffa_timer(messageId, messageDestination, id)
{
    return is_full_deathmatch() ? PLUGIN_HANDLED : PLUGIN_CONTINUE
}

stock refresh_alive_player_hud(id)
{
    if (!is_user_connected(id) || !is_user_alive(id)) return

    // Reconnecting while dead can leave the client-side HideWeapon/health
    // caches in observer state. Reset the authoritative HUD mask and invalidate
    // the cached values so ReGameDLL sends health, armor and HUD visibility
    // again on the next client update.
    set_member(id, m_iHideHUD, is_full_deathmatch() ? HIDEHUD_TIMER : 0)
    set_member(id, m_iClientHideHUD, -1)
    set_member(id, m_iClientHealth, -1)
    set_member(id, m_iClientBattery, -1)
}

public on_spawn(id)
{
    acHasAngles[id] = false
    legacyBotCrouchHop[id] = false
    legacyBotHopRetryAt[id] = 0.0
    place_ffa_spawn(id)
    if (!is_user_connected(id) || is_aimbot_detection_probe(id)) return
    if (is_user_bot(id) && !legacyBotSelectionAssigned[id])
    {
        new CsTeams:botTeam = cs_get_user_team(id)
        if (botTeam == CS_TEAM_CT || botTeam == CS_TEAM_T)
        {
            new eligibleCount, otherBotCount
            for (new other = 1; other <= get_maxplayers(); other++)
            {
                if (other == id || !is_user_connected(other) || !is_user_bot(other) ||
                    !legacyBotSelectionAssigned[other] || cs_get_user_team(other) != botTeam)
                    continue
                otherBotCount++
                if (legacyBotBhopEligible[other])
                    eligibleCount++
            }
            // Select half of each side, rounding up on odd team sizes.
            legacyBotBhopEligible[id] = eligibleCount * 2 <= otherBotCount
            legacyBotSelectionAssigned[id] = true
        }
    }
    if (lockedTeam[id] == CS_TEAM_UNASSIGNED) lockedTeam[id] = cs_get_user_team(id)
    else if (cs_get_user_team(id) != lockedTeam[id]) cs_set_user_team(id, lockedTeam[id])
    clear_damage(id)
    restore_saved_money_now(id)
    if (is_deathmatch_active())
    {
        if (is_fight_yard())
        {
            clear_deathmatch_loadout(id)
            clear_deathmatch_consumable_entitlements(id)
            deathmatchMoneyUpdating[id] = true
            cs_set_user_money(id, 0, 1)
            deathmatchMoneyUpdating[id] = false
        }
        else
        {
            if (is_ffa_deathmatch() && is_competitive_bot(id))
                give_ffa_bot_random_loadout(id)
            else
                restore_deathmatch_loadout(id)
            give_ffa_spawn_consumables(id)
            set_deathmatch_money(id)
        }
    }
    if (matchLive && (is_ffa_deathmatch() || get_cvar_num("competitive_free_armor")))
        cs_set_user_armor(id, 100, CS_ARMOR_VESTHELM)
    if (matchLive && get_cvar_num("competitive_free_defuse_kit") && cs_get_user_team(id) == CS_TEAM_CT)
        cs_set_user_defuse(id, 1)
    restore_player_round_state(id)
    suppressReconnectRespawn[id] = false
    refresh_alive_player_hud(id)
    if (is_ffa_deathmatch() && is_user_alive(id))
    {
        if (ffaPlayerModelIndex[id] < 0 || ffaPlayerModelIndex[id] >= sizeof(FFA_PLAYER_MODELS))
            ffaPlayerModelIndex[id] = random_num(0, sizeof(FFA_PLAYER_MODELS) - 1)
        cs_set_user_model(id, FFA_PLAYER_MODELS[ffaPlayerModelIndex[id]], true)
        remove_task(TASK_RESPAWN + id)
        if (!is_competitive_bot(id)) rg_send_bartime(id, 0, false)
        check_match_ready()
    }
}

public roster_reset()
{
    rosterCount = 0
    botRosterConfigured = false
    botSlots[1] = 0; botSlots[2] = 0
    botAssigned[1] = 0; botAssigned[2] = 0
    teamAStartsTerrorist = bool:get_cvar_num("competitive_team_a_starts_t")
    botNameCount[1] = 0; botNameCount[2] = 0
    roundSerial = 0
    roundEnding = false
    for (new index = 0; index < MAX_ROSTER_PLAYERS; index++)
    {
        rosterKills[index] = 0
        rosterQuestCount[index] = 0
        rosterIps[index][0] = 0
        rosterDeaths[index] = 0
        rosterAssists[index] = 0
        rosterHeadshots[index] = 0
        rosterDamage[index] = 0
        rosterGrenadeKills[index] = 0
        rosterMoney[index] = 0
        rosterMoneyValid[index] = false
        rosterRoundStateValid[index] = false
        rosterWasAlive[index] = false
        rosterRoundSerial[index] = 0
        rosterHealth[index] = 0
        rosterArmor[index] = 0
        rosterArmorType[index] = CS_ARMOR_NONE
        rosterActiveWeapon[index] = 0
        rosterWeaponCount[index] = 0
        for (new quest = 0; quest < MAX_DAILY_QUESTS; quest++)
        {
            rosterQuestTitles[index][quest][0] = 0
            rosterQuestProgress[index][quest] = 0
            rosterQuestTargets[index][quest] = 0
            rosterQuestRewards[index][quest] = 0
            rosterQuestCompleted[index][quest] = false
        }
        for (new weaponId = 0; weaponId <= MAX_CS_WEAPON_ID; weaponId++)
            rosterBpAmmo[index][weaponId] = 0
        for (new slot = 0; slot < MAX_RECONNECT_WEAPONS; slot++)
        {
            rosterWeaponIds[index][slot] = 0
            rosterWeaponClips[index][slot] = -1
            rosterWeaponSkinMarkers[index][slot] = 0
        }
        for (new target = 0; target < MAX_ROSTER_PLAYERS; target++)
            reportSubmitted[index][target] = false
    }
    for (new team = 1; team <= 2; team++)
        for (new index = 0; index < MAX_TEAM_PLAYERS; index++)
        {
            botNames[team][index][0] = 0
            botPersonalities[team][index][0] = 0
            botCountries[team][index][0] = 0
            botChatStyles[team][index][0] = 0
        }
}

public roster_player()
{
    new rosterIndex = -1
    for (new index = 0; index < rosterCount; index++)
    {
        if (rosterTokens[index][0] != 0) continue
        rosterIndex = index
        break
    }
    if (rosterIndex == -1)
    {
        if (rosterCount >= MAX_ROSTER_PLAYERS) return
        rosterIndex = rosterCount
        rosterCount++
    }
    reset_reused_roster_slot(rosterIndex)
    read_argv(1, rosterTokens[rosterIndex], charsmax(rosterTokens[]))
    read_argv(2, rosterNames[rosterIndex], charsmax(rosterNames[]))
    rosterTeams[rosterIndex] = read_argv_int(3)
    read_argv(4, rosterIps[rosterIndex], charsmax(rosterIps[]))
    new fingerprint[13]
    token_fingerprint(rosterTokens[rosterIndex], fingerprint, charsmax(fingerprint))
    server_print("[1.6 Competitive][Join] roster token ready slot=%d fingerprint=%s", rosterIndex, fingerprint)
}

stock reset_reused_roster_slot(index)
{
    friendly_fire_reset_roster(index)
    rosterNames[index][0] = 0
    rosterTokens[index][0] = 0
    rosterIps[index][0] = 0
    rosterTeams[index] = 0
    rosterKills[index] = 0
    rosterDeaths[index] = 0
    rosterAssists[index] = 0
    rosterHeadshots[index] = 0
    rosterDamage[index] = 0
    rosterGrenadeKills[index] = 0
    rosterQuestCount[index] = 0
    rosterMoney[index] = 0
    rosterMoneyValid[index] = false
    rosterRoundStateValid[index] = false
    rosterWasAlive[index] = false
    rosterRoundSerial[index] = 0
    rosterHealth[index] = 0
    rosterArmor[index] = 0
    rosterArmorType[index] = CS_ARMOR_NONE
    rosterActiveWeapon[index] = 0
    rosterWeaponCount[index] = 0
    for (new quest = 0; quest < MAX_DAILY_QUESTS; quest++)
    {
        rosterQuestTitles[index][quest][0] = 0
        rosterQuestProgress[index][quest] = 0
        rosterQuestTargets[index][quest] = 0
        rosterQuestRewards[index][quest] = 0
        rosterQuestCompleted[index][quest] = false
    }
    for (new weaponId = 0; weaponId <= MAX_CS_WEAPON_ID; weaponId++)
        rosterBpAmmo[index][weaponId] = 0
    for (new slot = 0; slot < MAX_RECONNECT_WEAPONS; slot++)
    {
        rosterWeaponIds[index][slot] = 0
        rosterWeaponClips[index][slot] = -1
        rosterWeaponSkinMarkers[index][slot] = 0
    }
    for (new target = 0; target < MAX_ROSTER_PLAYERS; target++)
    {
        reportSubmitted[index][target] = false
        reportSubmitted[target][index] = false
    }
}

public roster_revoke()
{
    new token[65]
    read_argv(1, token, charsmax(token))
    for (new index = 0; index < rosterCount; index++)
    {
        if (!equal(token, rosterTokens[index])) continue
        rosterTokens[index][0] = 0
        return
    }
}

public roster_bots()
{
    botSlots[1] = clamp(read_argv_int(1), 0, MAX_TEAM_PLAYERS)
    botSlots[2] = clamp(read_argv_int(2), 0, MAX_TEAM_PLAYERS)
    botRosterConfigured = true
    sync_roster_bot_quota()
}

public roster_bot_name()
{
    new team = read_argv_int(1)
    if (team < 1 || team > 2 || botNameCount[team] >= MAX_TEAM_PLAYERS) return
    new index = botNameCount[team]
    read_argv(2, botNames[team][index], charsmax(botNames[][]))
    read_argv(3, botPersonalities[team][index], charsmax(botPersonalities[][]))
    read_argv(4, botCountries[team][index], charsmax(botCountries[][]))
    read_argv(5, botChatStyles[team][index], charsmax(botChatStyles[][]))
    if (!equal(botPersonalities[team][index], "careful") && !equal(botPersonalities[team][index], "rusher"))
        copy(botPersonalities[team][index], charsmax(botPersonalities[][]), "normal")
    if (!equal(botChatStyles[team][index], "talkative") && !equal(botChatStyles[team][index], "rude") && !equal(botChatStyles[team][index], "sweet") && !equal(botChatStyles[team][index], "quiet") && !equal(botChatStyles[team][index], "dry"))
        copy(botChatStyles[team][index], charsmax(botChatStyles[][]), "normal")
    botNameCount[team]++
}

public roster_bot_remove()
{
    new team = read_argv_int(1)
    if (team < 1 || team > 2) return
    new name[32]
    read_argv(2, name, charsmax(name))
    for (new index = 0; index < botNameCount[team]; index++)
    {
        if (!equal(name, botNames[team][index])) continue
        for (new next = index; next < botNameCount[team] - 1; next++)
        {
            copy(botNames[team][next], charsmax(botNames[][]), botNames[team][next + 1])
            copy(botPersonalities[team][next], charsmax(botPersonalities[][]), botPersonalities[team][next + 1])
            copy(botCountries[team][next], charsmax(botCountries[][]), botCountries[team][next + 1])
            copy(botChatStyles[team][next], charsmax(botChatStyles[][]), botChatStyles[team][next + 1])
        }
        botNameCount[team]--
        botNames[team][botNameCount[team]][0] = 0
        botPersonalities[team][botNameCount[team]][0] = 0
        botCountries[team][botNameCount[team]][0] = 0
        botChatStyles[team][botNameCount[team]][0] = 0
        botSlots[team] = max(0, botSlots[team] - 1)
        botAssigned[team] = max(0, botAssigned[team] - 1)
        sync_roster_bot_quota()
        return
    }
}

public roster_bot_quota()
{
    // Preserve the worker command, but never accept a quota that differs
    // from the bot slots updated by roster_bots / roster_bot_remove.
    sync_roster_bot_quota()
}

public sync_roster_bot_quota()
{
    if (!botRosterConfigured) return
    new count = botSlots[1] + botSlots[2]
    new bool:hasYaPb = get_cvar_pointer("yb_quota") != 0
    sync_bot_controller("yb_quota", "yb_quota_mode", hasYaPb ? count : 0)
    // ReGameDLL's ZBot controller must stay off when YaPB owns the bots.
    sync_bot_controller("bot_quota", "bot_quota_mode", hasYaPb ? 0 : count)
}

stock sync_bot_controller(const quotaCvar[], const modeCvar[], count)
{
    new quota = get_cvar_pointer(quotaCvar)
    if (!quota) return
    if (get_pcvar_num(quota) != count)
    {
        log_amx("Bot quota corrected: %s %d -> %d (room roster)", quotaCvar, get_pcvar_num(quota), count)
        set_pcvar_num(quota, count)
    }
    new mode = get_cvar_pointer(modeCvar)
    if (!mode) return
    new value[16]
    get_pcvar_string(mode, value, charsmax(value))
    if (!equal(value, "normal")) set_pcvar_string(mode, "normal")
}

public roster_quest()
{
    new token[65]
    read_argv(1, token, charsmax(token))
    for (new index = 0; index < rosterCount; index++)
    {
        if (!equal(token, rosterTokens[index]) || rosterQuestCount[index] >= MAX_DAILY_QUESTS) continue
        new quest = rosterQuestCount[index]
        read_argv(2, rosterQuestTitles[index][quest], charsmax(rosterQuestTitles[][]))
        rosterQuestProgress[index][quest] = read_argv_int(3)
        rosterQuestTargets[index][quest] = read_argv_int(4)
        rosterQuestRewards[index][quest] = read_argv_int(5)
        rosterQuestCompleted[index][quest] = bool:read_argv_int(6)
        rosterQuestCount[index]++
        return
    }
}

public on_t_win() { if (!is_full_deathmatch() && matchLive && !swappingSides) record_round(CS_TEAM_T); }
public on_ct_win() { if (!is_full_deathmatch() && matchLive && !swappingSides) record_round(CS_TEAM_CT); }

// ReGameDLL supplies the reason before its SendAudio winner announcement.
public on_round_end_reason(WinStatus:status, ScenarioEventEndRound:event, Float:tmDelay)
{
    if (!matchLive || swappingSides || roundEnding || status == WINSTATUS_NONE || status == WINSTATUS_DRAW) return
    switch (event)
    {
        case ROUND_BOMB_DEFUSED: currentRoundEvent = 'D'
        case ROUND_TARGET_BOMB: currentRoundEvent = 'B'
        case ROUND_ALL_HOSTAGES_RESCUED: currentRoundEvent = 'H'
        case ROUND_TARGET_SAVED, ROUND_HOSTAGE_NOT_RESCUED, ROUND_TERRORISTS_NOT_ESCAPED, ROUND_VIP_NOT_ESCAPED: currentRoundEvent = 'C'
        case ROUND_CTS_WIN, ROUND_TERRORISTS_WIN, ROUND_ESCAPING_TERRORISTS_NEUTRALIZED: currentRoundEvent = 'K'
        default: currentRoundEvent = 'U'
    }
}

stock record_round(CsTeams:winningSide)
{
    roundEnding = true
    balance_record_round(winningSide)
    new winner = logical_team_for_side(winningSide)
    logicalScore[winner]++
    roundsPlayed++
    if (roundsPlayed <= 99)
    {
        roundWinners[roundsPlayed - 1] = winningSide == CS_TEAM_CT ? 'C' : 'T'
        roundWinners[roundsPlayed] = 0
        roundEvents[roundsPlayed - 1] = currentRoundEvent
        roundEvents[roundsPlayed] = 0
    }
    write_score_event("round_end", winner, logicalScore[1], logicalScore[2])
    announce_round_accolade(winningSide)

    new regulationHalfRounds = get_cvar_num("competitive_regulation_half_rounds")
    new overtimeHalfRounds = max(1, get_cvar_num("competitive_overtime_half_rounds"))
    new bool:overtimeEnabled = bool:get_cvar_num("competitive_overtime_enabled")
    // Each tied overtime block starts another block, never sudden death.
    if (overtimeEnabled && regulationHalfRounds > 0 &&
        logicalScore[1] == logicalScore[2] && logicalScore[1] >= regulationHalfRounds &&
        (logicalScore[1] - regulationHalfRounds) % overtimeHalfRounds == 0)
        winTarget = logicalScore[1] + overtimeHalfRounds + 1

    sync_public_match_score()

    if (logicalScore[winner] >= winTarget)
    {
        matchLive = false
        new winningSideName[4]
        if (physical_side_for_logical(winner) == CS_TEAM_T)
            copy(winningSideName, charsmax(winningSideName), "T")
        else
            copy(winningSideName, charsmax(winningSideName), "CT")
        set_server_name("%s won", winningSideName)
        client_print(0, print_chat, "[1.6 Competitive] %s won the match.", winningSideName)
        write_final_player_stats(winner, 0)
        write_score_event("match_finished", winner, logicalScore[1], logicalScore[2])
        return
    }

    if (get_cvar_num("competitive_halftime_enabled") &&
        (roundsPlayed == regulationHalfRounds ||
        (overtimeEnabled && regulationHalfRounds > 0 && roundsPlayed >= regulationHalfRounds * 2 &&
        (roundsPlayed - regulationHalfRounds * 2) % overtimeHalfRounds == 0)))
        swap_sides(roundsPlayed == regulationHalfRounds ||
            (roundsPlayed - regulationHalfRounds * 2) % (overtimeHalfRounds * 2) != 0)
    else refresh_server_name()
}

// Competitive round awards use only events measured by this game server.
// The small data file is read by the authenticated launcher scoreboard bridge.
stock announce_round_accolade(CsTeams:winningSide)
{
    new bestId = 0, bestScore = -1
    for (new id = 1; id <= 32; id++)
    {
        if (!is_user_connected(id) || get_user_team(id) != _:winningSide) continue
        new score = roundKills[id] * 100 + roundAssists[id] * 35 + roundDamage[id] / 4
        if (score > bestScore)
        {
            bestId = id
            bestScore = score
        }
    }
    if (!bestId) return

    new maxDamage = 0, maxAssists = 0
    for (new id = 1; id <= 32; id++)
        if (is_user_connected(id))
        {
            maxDamage = max(maxDamage, roundDamage[id])
            maxAssists = max(maxAssists, roundAssists[id])
        }
    new code = 0, value = 0, title[32], detail[40]
    if (roundKills[bestId] >= 5)
    {
        code = 1; value = roundKills[bestId]
        copy(title, charsmax(title), "Ace in the Hole")
        formatex(detail, charsmax(detail), "%d kills", value)
    }
    else if (roundKills[bestId] == 4)
    {
        code = 2; value = 4
        copy(title, charsmax(title), "Quad")
        copy(detail, charsmax(detail), "4 kills")
    }
    else if (roundKills[bestId] == 3)
    {
        code = 3; value = 3
        copy(title, charsmax(title), "Triple")
        copy(detail, charsmax(detail), "3 kills")
    }
    else if (roundDamage[bestId] >= 200 && roundDamage[bestId] == maxDamage)
    {
        code = 4; value = roundDamage[bestId]
        copy(title, charsmax(title), "Pain Train")
        formatex(detail, charsmax(detail), "%d damage", value)
    }
    else if (roundHeadshots[bestId] >= 2 && roundHeadshots[bestId] == roundKills[bestId])
    {
        code = 5; value = roundHeadshots[bestId]
        copy(title, charsmax(title), "Bullseye")
        formatex(detail, charsmax(detail), "%d headshot kills", value)
    }
    else if (roundAssists[bestId] >= 2 && roundAssists[bestId] == maxAssists)
    {
        code = 6; value = roundAssists[bestId]
        copy(title, charsmax(title), "Assistant")
        formatex(detail, charsmax(detail), "%d assists", value)
    }
    else if (bestId == roundFirstKiller && roundKills[bestId] > 0)
    {
        code = 7; value = roundKills[bestId]
        copy(title, charsmax(title), "Entry Fragger")
        copy(detail, charsmax(detail), "first kill")
    }
    else
    {
        code = 8; value = roundKills[bestId]
        copy(title, charsmax(title), "Valuable Player")
        formatex(detail, charsmax(detail), "%d kills, %d assists", roundKills[bestId], roundAssists[bestId])
    }

    new name[32], safe[32], count = 0
    get_user_name(bestId, name, charsmax(name))
    for (new index = 0; name[index] && count < charsmax(safe); index++)
        if (name[index] >= 32 && name[index] != 127)
            safe[count++] = name[index]
    safe[count] = 0
    new bool:validName = count > 0
    if (!safe[0]) copy(safe, charsmax(safe), "Player")

    new directory[192], target[224], temporary[232]
    get_datadir(directory, charsmax(directory))
    formatex(target, charsmax(target), "%s/16c_round_accolade.tsv", directory)
    formatex(temporary, charsmax(temporary), "%s.tmp", target)
    new file = validName ? fopen(temporary, "wt") : 0
    new bool:published = false
    if (file)
    {
        fprintf(file, "%d^t%d^t%d^t%d^t%d^t%s^n", min(roundsPlayed, 99),
            winningSide == CS_TEAM_CT ? 2 : 1, code, bestId, value, safe)
        fclose(file)
        // get_datadir/fopen paths are relative to the mod directory, not HLDS cwd.
        published = bool:rename_file(temporary, target, 1)
        if (!published) delete_file(temporary)
    }
    if (!published) log_amx("Round accolade file publication failed (round %d)", roundsPlayed)
    for (new viewer = 1; viewer <= 32; viewer++)
        if (is_user_connected(viewer) && !is_user_hltv(viewer)
            && (!published || roundHudSeen[viewer] <= 0.0 || get_gametime() - roundHudSeen[viewer] > 3.0))
            client_print(viewer, print_chat, "[1.6 Competitive] %s win | MVP: %s | %s (%s)",
                winningSide == CS_TEAM_CT ? "CT" : "T", safe, title, detail)
}

public on_round_hud_ready(id)
{
    if (id >= 1 && id <= 32 && is_user_connected(id)) roundHudSeen[id] = get_gametime()
    return PLUGIN_HANDLED
}

public on_round_hud_unavailable(id)
{
    if (id >= 1 && id <= 32) roundHudSeen[id] = 0.0
    return PLUGIN_HANDLED
}

stock swap_sides(bool:changeSides = true)
{
    swapTeamsAtRestart = changeSides
    swappingSides = true
    matchLive = false
    if (roundsPlayed == get_cvar_num("competitive_regulation_half_rounds"))
    {
        client_print(0, print_center, "HALF TIME")
        client_print(0, print_chat, "[1.6 Competitive] Half time. Teams are switching sides.")
        for (new id = 1; id <= 32; id++)
            if (is_user_connected(id) && !is_user_bot(id) && !is_user_hltv(id))
                client_cmd(id, "spk ^"vox/attention _comma time^"")
    }
    refresh_server_name()
    write_event_number("halftime", roundsPlayed)
}

public on_new_round()
{
    ping_reset_all()
    roundSerial++
    roundEnding = false
    currentRoundEvent = 'U'
    new accoladeDirectory[192], accoladePath[224]
    get_datadir(accoladeDirectory, charsmax(accoladeDirectory))
    formatex(accoladePath, charsmax(accoladePath), "%s/16c_round_accolade.tsv", accoladeDirectory)
    delete_file(accoladePath)
    roundFirstKiller = 0
    for (new id = 1; id <= 32; id++)
    {
        roundKills[id] = 0
        roundAssists[id] = 0
        roundDamage[id] = 0
        roundHeadshots[id] = 0
    }
    new bool:rejoinDeadPlayer[33]
    for (new id = 1; id <= 32; id++)
        if (is_user_connected(id))
        {
            rejoinDeadPlayer[id] = suppressReconnectRespawn[id]
            suppressReconnectRespawn[id] = false
            restoreRoundStateOnSpawn[id] = false
        }

    if (!swappingSides)
    {
        for (new id = 1; id <= 32; id++)
            if (rejoinDeadPlayer[id] && is_user_connected(id) && (logicalTeam[id] == 1 || logicalTeam[id] == 2))
                apply_player_side(id, true)
        return
    }

    if (swapTeamsAtRestart) sidesSwapped = !sidesSwapped
    for (new id = 1; id <= 32; id++)
        if (is_user_connected(id) && logicalTeam[id] != 0)
        {
            apply_player_side(id, rejoinDeadPlayer[id])
            if (is_user_alive(id))
                reset_halftime_loadout(id)
        }
    refresh_team_scoreboard()
}

stock reset_halftime_loadout(id)
{
    rg_remove_all_items(id, false)
    cs_set_user_armor(id, 0, CS_ARMOR_NONE)
    rg_give_item(id, "weapon_knife")
    if (cs_get_user_team(id) == CS_TEAM_T)
    {
        rg_give_item(id, "weapon_glock18")
        cs_set_user_bpammo(id, CSW_GLOCK18, 120)
    }
    else if (cs_get_user_team(id) == CS_TEAM_CT)
    {
        rg_give_item(id, "weapon_usp")
        cs_set_user_bpammo(id, CSW_USP, 100)
    }
}

stock reset_halftime_economy()
{
    balance_reset_economy()
    set_member_game(m_iNumConsecutiveCTLoses, 0)
    set_member_game(m_iNumConsecutiveTerroristLoses, 0)
    set_member_game(m_iLoserBonus, rg_get_account_rules(RR_LOSER_BONUS_DEFAULT))
    new startingMoney = get_cvar_num("mp_startmoney")
    // GoldSrc/ReGameDLL awards round money before this post-restart hook.
    // Reset both connected players and reconnect snapshots for every OT half.
    new regulationHalfRounds = get_cvar_num("competitive_regulation_half_rounds")
    if (get_cvar_num("competitive_overtime_enabled") && regulationHalfRounds > 0 &&
        roundsPlayed >= regulationHalfRounds * 2)
        startingMoney = 10000
    for (new index = 0; index < rosterCount; index++)
    {
        rosterMoney[index] = startingMoney
        rosterMoneyValid[index] = true
    }
    for (new id = 1; id <= 32; id++)
        if (is_user_connected(id) && logicalTeam[id] != 0)
            cs_set_user_money(id, startingMoney, 1)
}

public on_restart_round_post()
{
    if (swappingSides)
    {
        reset_halftime_economy()
        return
    }

    if (!matchStarting) return
    balance_reset_economy()

    new startingMoney = get_cvar_num("mp_startmoney")
    for (new id = 1; id <= 32; id++)
        if (is_user_connected(id) && logicalTeam[id] != 0)
            cs_set_user_money(id, startingMoney, 1)
}

public resume_after_side_swap()
{
    if (!swappingSides) return

    swappingSides = false
    matchLive = true
    announce_match_phase()
    refresh_server_name()
    refresh_team_scoreboard()
    refresh_player_scoreboard()
}

// Stock GoldSrc VOX contains "second", "over", and "time", but no "half".
// Pair the spoken cue with explicit text for the regulation second half.
stock announce_match_phase()
{
    new regulationHalf = get_cvar_num("competitive_regulation_half_rounds")
    new overtimeHalf = max(1, get_cvar_num("competitive_overtime_half_rounds"))
    if (roundsPlayed == regulationHalf)
    {
        client_print(0, print_center, "SECOND HALF")
        client_print(0, print_chat, "[1.6 Competitive] Second half has started.")
        for (new id = 1; id <= 32; id++)
            if (is_user_connected(id) && !is_user_bot(id) && !is_user_hltv(id))
                client_cmd(id, "spk ^"vox/attention _comma second^"")
    }
    else if (regulationHalf > 0 && roundsPlayed >= regulationHalf * 2 &&
        (roundsPlayed - regulationHalf * 2) % (overtimeHalf * 2) == 0)
    {
        new overtimeNumber = (roundsPlayed - regulationHalf * 2) / (overtimeHalf * 2) + 1
        client_print(0, print_center, "OVERTIME %d", overtimeNumber)
        client_print(0, print_chat, "[1.6 Competitive] Overtime %d has started.", overtimeNumber)
        for (new id = 1; id <= 32; id++)
            if (is_user_connected(id) && !is_user_bot(id) && !is_user_hltv(id))
                client_cmd(id, "spk ^"vox/over time^"")
    }
}

stock refresh_server_name()
{
    if (is_ffa_deathmatch())
    {
        set_server_name("FFA | first to %d", get_cvar_num("competitive_rounds_to_win"))
        return
    }

    if (is_fight_yard())
    {
        set_server_name("Fight Yard | first team to %d", get_cvar_num("competitive_rounds_to_win"))
        return
    }

    if (swappingSides)
    {
        if (winTarget > get_cvar_num("competitive_regulation_half_rounds") + 1)
            set_server_name(swapTeamsAtRestart ? "Overtime | switching sides" : "Overtime | resetting economy")
        else set_server_name("Half-time")
        return
    }

    if (!matchLive)
    {
        set_server_name("Warm-up")
        return
    }

    if (!get_cvar_num("competitive_halftime_enabled"))
    {
        set_server_name("Unrated | first to %d", winTarget)
        return
    }

    new regulationHalfRounds = get_cvar_num("competitive_regulation_half_rounds")
    if (roundsPlayed < regulationHalfRounds)
    {
        new remaining = regulationHalfRounds - roundsPlayed
        set_server_name("%d round%s until half", remaining, remaining == 1 ? "" : "s")
        return
    }

    if (roundsPlayed < regulationHalfRounds * 2)
    {
        set_live_win_count_server_name()
        return
    }

    new overtimeHalfRounds = max(1, get_cvar_num("competitive_overtime_half_rounds"))
    new overtimeNumber = max(1, (winTarget - regulationHalfRounds - 1) / overtimeHalfRounds)
    new overtimeRound = clamp(roundsPlayed - regulationHalfRounds * 2 - (overtimeNumber - 1) * overtimeHalfRounds * 2 + 1, 1, overtimeHalfRounds * 2)
    new ctNeeds = max(0, winTarget - logicalScore[logical_team_for_side(CS_TEAM_CT)])
    new tNeeds = max(0, winTarget - logicalScore[logical_team_for_side(CS_TEAM_T)])
    set_server_name("OT%d %d/%d | CT needs %d | T needs %d", overtimeNumber, overtimeRound, overtimeHalfRounds * 2, ctNeeds, tNeeds)
}

// Logical teams change physical sides at half-time. The hostname must use the
// current T/CT mapping so its leading-side win count stays meaningful after a swap.
stock set_live_win_count_server_name()
{
    new terroristTeam = logical_team_for_side(CS_TEAM_T)
    new ctTeam = logical_team_for_side(CS_TEAM_CT)
    new terroristRoundsToWin = max(0, winTarget - logicalScore[terroristTeam])
    new ctRoundsToWin = max(0, winTarget - logicalScore[ctTeam])
    set_server_name("CT needs %d | T needs %d", ctRoundsToWin, terroristRoundsToWin)
}

stock set_server_name(const pattern[], any:...)
{
    new status[64]
    new serverName[MAX_CLIENT_SERVER_NAME_LENGTH + 1]
    vformat(status, charsmax(status), pattern, 2)
    if (strlen(status) + strlen("1.6 Competitive | ") <= MAX_CLIENT_SERVER_NAME_LENGTH)
        format(serverName, charsmax(serverName), "1.6 Competitive | %s", status)
    else
        copy(serverName, charsmax(serverName), status)
    server_cmd("hostname ^"%s^"", serverName)
    server_exec()
    message_begin(MSG_ALL, serverNameMessage)
    write_string(serverName)
    message_end()
    server_print("[1.6 Competitive] Hostname set to: %s", serverName)
}

stock refresh_player_score(id)
{
    if (!is_user_connected(id) || logicalTeam[id] == 0) return

    set_user_frags(id, playerKills[id])
    cs_set_user_deaths(id, playerDeaths[id])
    message_begin(MSG_ALL, scoreInfoMessage)
    write_byte(id)
    write_short(playerKills[id])
    write_short(playerDeaths[id])
    write_short(0)
    write_short(_:cs_get_user_team(id))
    message_end()
}

public refresh_player_scoreboard()
{
    for (new id = 1; id <= 32; id++)
        if (is_user_connected(id) && logicalTeam[id] != 0)
            refresh_player_score(id)
}

public on_team_score_message(messageId, messageDestination, messageEntity)
{
    new sideName[16]
    get_msg_arg_string(1, sideName, charsmax(sideName))
    if (equal(sideName, "TERRORIST"))
        set_msg_arg_int(2, ARG_SHORT, logicalScore[logical_team_for_side(CS_TEAM_T)])
    else if (equal(sideName, "CT"))
        set_msg_arg_int(2, ARG_SHORT, logicalScore[logical_team_for_side(CS_TEAM_CT)])
}

stock sync_public_match_score()
{
    set_cvar_num("competitive_score_target", winTarget)

    if (is_ffa_deathmatch())
    {
        set_cvar_num("competitive_score_t", 0)
        set_cvar_num("competitive_score_ct", 0)
        return
    }

    set_cvar_num("competitive_score_t", logicalScore[logical_team_for_side(CS_TEAM_T)])
    set_cvar_num("competitive_score_ct", logicalScore[logical_team_for_side(CS_TEAM_CT)])
}

stock refresh_team_scoreboard()
{
    sync_public_match_score()
    send_team_score("TERRORIST", logicalScore[logical_team_for_side(CS_TEAM_T)])
    send_team_score("CT", logicalScore[logical_team_for_side(CS_TEAM_CT)])
}

stock send_team_score(const sideName[], score)
{
    message_begin(MSG_ALL, teamScoreMessage)
    write_string(sideName)
    write_short(score)
    message_end()
}

public on_take_damage(victim, inflictor, attacker, Float:damage, damageBits)
{
    if (attacker >= 1 && attacker <= 32)
        balanceKillWeapon[attacker] = inflictor == attacker ? get_user_weapon(attacker) : 0
    if (is_aimbot_detection_probe(victim) || is_aimbot_detection_probe(attacker)) return
    if (get_pcvar_num(legacyMovement) && damageBits == DMG_FALL)
    {
        new Float:multiplier = get_pcvar_float(legacyFallDamage)
        if (multiplier < 0.0) multiplier = 0.0
        if (multiplier > 10.0) multiplier = 10.0
        SetHamParamFloat(4, damage * multiplier)
        return
    }
    if (attacker >= 1 && attacker <= 32 && attacker != victim && is_user_connected(attacker))
    {
        damageByPlayer[attacker][victim] += floatround(damage)
        if (matchLive) playerDamage[attacker] += floatround(damage)
        if (matchLive && !is_full_deathmatch() && get_user_team(attacker) != get_user_team(victim))
            roundDamage[attacker] += floatround(damage)
    }
}

public on_killed(victim, killer, inflictor)
{
    ping_remove(victim)
    if (is_aimbot_detection_probe(victim) || is_aimbot_detection_probe(killer))
    {
        clear_damage(victim)
        return
    }

    if (is_deathmatch_active() && !is_fight_yard())
        save_deathmatch_loadout(victim)

    hide_skin_player_model(victim)
    if (swappingSides)
    {
        clear_damage(victim)
        return
    }

    new assist = 0
    for (new attacker = 1; attacker <= 32; attacker++)
    {
        if (attacker != killer && is_user_connected(attacker) && damageByPlayer[attacker][victim] > 30)
        {
            assist = attacker
            break
        }
    }
    // FFA counts every other player; team modes count only opponents.
    new bool:countedKill = killer >= 1 && killer <= 32 && victim >= 1 && victim <= 32
        && killer != victim && is_user_connected(killer)
        && (is_ffa_deathmatch() || get_user_team(killer) != get_user_team(victim))
    if (matchLive)
    {
        if (countedKill)
        {
            playerKills[killer]++
            if (!is_full_deathmatch())
            {
                roundKills[killer]++
                if (!roundFirstKiller) roundFirstKiller = killer
            }
        }
        if (victim >= 1 && victim <= 32) playerDeaths[victim]++
        if (countedKill)
        {
            if (assist >= 1 && assist <= 32)
            {
                playerAssists[assist]++
                if (!is_full_deathmatch()) roundAssists[assist]++
            }
            prepare_assist_killfeed(killer, assist)
        }
    }
    if (matchLive && is_full_deathmatch())
    {
        write_event_pair("deathmatch_death", killer, victim, assist)
        if (
            killer >= 1 && killer <= 32 &&
            victim >= 1 && victim <= 32 &&
            killer != victim &&
            logicalTeam[killer] >= 1 && logicalTeam[killer] <= 2
        )
        {
            if (is_ffa_deathmatch())
            {
                announce_ffa_kill_milestone(killer)
                if (playerKills[killer] >= winTarget)
                    finish_ffa_match(killer)
            }
            else if (
                is_fight_yard() &&
                logicalTeam[victim] >= 1 && logicalTeam[victim] <= 2 &&
                logicalTeam[killer] != logicalTeam[victim]
            )
            {
                logicalScore[logicalTeam[killer]]++
                refresh_team_scoreboard()
                if (logicalScore[logicalTeam[killer]] >= winTarget)
                    finish_fight_yard_match(logicalTeam[killer])
            }
        }
    }
    else if (matchLive) write_event_pair("player_death", killer, victim, assist)
    else if (!ffaFinished)
        write_event_pair("warmup_death", killer, victim, assist)

    if (!is_full_deathmatch() && !matchLive && !swappingSides && !ffaFinished)
    {
        remove_task(TASK_RESPAWN + victim)
        set_task(1.0, "respawn_assigned_player", TASK_RESPAWN + victim)
    }
    clear_damage(victim)
}

stock announce_ffa_kill_milestone(killer)
{
    if (!is_ffa_deathmatch() || !matchLive || ffaFinished) return
    if (killer < 1 || killer > 32 || !is_user_connected(killer)) return

    new remaining = winTarget - playerKills[killer]
    if (remaining != 30 && remaining != 10 && remaining != 3) return

    if (remaining == 30)
    {
        if (ffaMilestone30Announced) return
        ffaMilestone30Announced = true
    }
    else if (remaining == 10)
    {
        if (ffaMilestone10Announced) return
        ffaMilestone10Announced = true
    }
    else
    {
        if (ffaMilestone3Announced) return
        ffaMilestone3Announced = true
    }

    new playerName[32]
    get_user_name(killer, playerName, charsmax(playerName))

    if (remaining == 30)
        set_hudmessage(255, 190, 70, -1.0, 0.22, 1, 0.15, 3.5, 0.15, 0.35)
    else if (remaining == 10)
        set_hudmessage(255, 120, 40, -1.0, 0.22, 1, 0.12, 4.0, 0.12, 0.4)
    else
        set_hudmessage(255, 55, 55, -1.0, 0.22, 1, 0.1, 4.5, 0.1, 0.45)

    ShowSyncHudMsg(
        0,
        ffaMilestoneHudSync,
        "%d KILLS REMAINING^n%s IS CLOSING IN ON VICTORY",
        remaining,
        playerName
    )

    // Use stock Half-Life VOX so clients do not need to download custom audio.
    // The text banner carries the player context while VOX calls the countdown.
    for (new id = 1; id <= 32; id++)
    {
        if (!is_user_connected(id) || is_competitive_bot(id) || is_user_hltv(id)) continue

        if (remaining == 30)
            client_cmd(id, "spk ^"vox/attention _comma thirty remaining^"")
        else if (remaining == 10)
            client_cmd(id, "spk ^"vox/warning _comma ten remaining^"")
        else
            client_cmd(id, "spk ^"vox/warning _comma three remaining^"")
    }

    client_print(0, print_chat, "[1.6 Competitive] %s needs %d more kills to win FFA.", playerName, remaining)
}

stock schedule_ffa_respawn(id)
{
    if (!is_full_deathmatch() || ffaFinished || matchTerminated) return
    if (!is_user_connected(id) || is_user_alive(id)) return
    if (is_user_hltv(id) || is_aimbot_detection_probe(id)) return
    if (logicalTeam[id] != 1 && logicalTeam[id] != 2) return
    remove_task(TASK_RESPAWN + id)
    set_task(float(FFA_RESPAWN_SECONDS), "respawn_assigned_player", TASK_RESPAWN + id)
    if (!is_competitive_bot(id))
    {
        rg_send_bartime(id, FFA_RESPAWN_SECONDS, false)
        client_print(id, print_center, "Respawning in 3 seconds...")
    }
}

public on_ffa_killed_post(victim, killer, inflictor)
{
    // Killed clears progress bars internally; start this only after it returns.
    schedule_ffa_respawn(victim)
}

stock cancel_ffa_respawns()
{
    if (!is_full_deathmatch()) return
    for (new id = 1; id <= 32; id++)
    {
        remove_task(TASK_RESPAWN + id)
        if (is_user_connected(id) && !is_competitive_bot(id) && !is_user_hltv(id))
            rg_send_bartime(id, 0, false)
    }
}

stock finish_ffa_match(winnerId)
{
    if (ffaFinished || !matchLive || !is_ffa_deathmatch()) return
    ffaFinished = true
    cancel_ffa_respawns()
    matchLive = false
    new runnerUpScore = 0
    for (new id = 1; id <= 32; id++)
        if (id != winnerId && is_user_connected(id) && playerKills[id] > runnerUpScore)
            runnerUpScore = playerKills[id]
    new winnerName[32]
    get_user_name(winnerId, winnerName, charsmax(winnerName))
    set_server_name("FFA finished")
    client_print(0, print_chat, "[1.6 Competitive] %s won FFA with %d kills.", winnerName, playerKills[winnerId])
    write_final_player_stats(logicalTeam[winnerId], winnerId)
    write_ffa_finished(logicalTeam[winnerId], playerKills[winnerId], runnerUpScore, winnerId)
}

stock write_ffa_finished(winnerTeam, winnerScore, runnerUpScore, winnerId)
{
    new eventLog[160], matchId[81], eventLine[320]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine), "{^"match_id^":^"%s^",^"type^":^"match_finished^",^"winner^":%d,^"team_a_score^":%d,^"team_b_score^":%d,^"winner_userid^":%d}", matchId, winnerTeam, winnerScore, runnerUpScore, winnerId)
    write_file(eventLog, eventLine, -1)
}

stock finish_fight_yard_match(winnerTeam)
{
    if (ffaFinished || !matchLive || !is_fight_yard()) return
    ffaFinished = true
    cancel_ffa_respawns()
    matchLive = false
    set_server_name("Fight Yard finished")
    client_print(0, print_chat, "[1.6 Competitive] Team %c won Fight Yard %d-%d.",
        winnerTeam == 1 ? 'A' : 'B', logicalScore[1], logicalScore[2])
    write_final_player_stats(winnerTeam, 0)
    write_fight_yard_finished(winnerTeam)
}

stock write_fight_yard_finished(winnerTeam)
{
    new eventLog[160], matchId[81], eventLine[256]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine), "{^"match_id^":^"%s^",^"type^":^"match_finished^",^"winner^":%d,^"team_a_score^":%d,^"team_b_score^":%d}", matchId, winnerTeam, logicalScore[1], logicalScore[2])
    write_file(eventLog, eventLine, -1)
}

stock prepare_assist_killfeed(killer, assist)
{
    if (assist < 1 || assist > 32 || killer < 1 || killer > 32 || assist == killer || !is_user_connected(assist) || !is_user_connected(killer)) return

    new killerName[32], assistName[32]
    get_user_name(killer, killerName, charsmax(killerName))
    get_user_name(assist, assistName, charsmax(assistName))
    formatex(deathFeedName, charsmax(deathFeedName), "%s + %s", killerName, assistName)

    deathFeedKiller = killer
    EnableHookChain(writeFullClientUpdateHook)
    rh_update_user_info(killer)
    DisableHookChain(writeFullClientUpdateHook)
    EnableHookChain(killPostHook)
}

public on_write_full_client_update(id, buffer)
{
    if (id == deathFeedKiller)
        set_key_value(buffer, "name", deathFeedName)
}

public on_death_message()
{
    if (matchLive)
    {
        new killer = get_msg_arg_int(1)
        new victim = get_msg_arg_int(2)
        if (killer >= 1 && killer <= 32 && victim >= 1 && victim <= 32 && killer != victim
            && (is_ffa_deathmatch() || get_user_team(killer) != get_user_team(victim)))
        {
            if (get_msg_arg_int(3))
            {
                playerHeadshots[killer]++
                if (!is_full_deathmatch()) roundHeadshots[killer]++
            }

            new weapon[24]
            get_msg_arg_string(4, weapon, charsmax(weapon))
            if (equal(weapon, "grenade")) playerGrenadeKills[killer]++
        }
    }
    if (get_msg_arg_int(1) == 0 && deathFeedKiller)
        set_msg_arg_int(1, ARG_BYTE, deathFeedKiller)
    // DeathMsg follows the server's kill accounting. Publish that verified
    // state now; the periodic snapshot remains a recovery heartbeat.
    write_scoreboard_snapshot()
}

public on_killed_post(victim, killer, inflictor)
{
    DisableHookChain(killPostHook)
    if (!deathFeedKiller) return

    new killerId = deathFeedKiller
    deathFeedKiller = 0
    if (is_user_connected(killerId)) rh_update_user_info(killerId)
}

stock operation_points_for_player(id, winnerTeam, winnerId)
{
    new completionPoints = max(0, get_cvar_num("competitive_operation_completion_points"))
    new winPoints = max(0, get_cvar_num("competitive_operation_win_points"))
    new roundWinPoints = max(0, get_cvar_num("competitive_operation_round_win_points"))
    new killPoints = max(0, get_cvar_num("competitive_operation_kill_points"))
    new assistPoints = max(0, get_cvar_num("competitive_operation_assist_points"))
    new headshotPoints = max(0, get_cvar_num("competitive_operation_headshot_points"))
    new damagePer100Points = max(0, get_cvar_num("competitive_operation_damage_per_100_points"))
    new performanceCap = max(0, get_cvar_num("competitive_operation_performance_cap"))

    new performance =
        playerKills[id] * killPoints +
        playerAssists[id] * assistPoints +
        playerHeadshots[id] * headshotPoints +
        (playerDamage[id] / 100) * damagePer100Points

    if (performance > performanceCap)
        performance = performanceCap

    // FFA has no round-win component. It still earns completion and
    // performance OP, and only the individual first-to-target winner receives
    // the win bonus.
    new roundsWon = 0
    if (!is_full_deathmatch() && logicalTeam[id] >= 1 && logicalTeam[id] <= 2)
        roundsWon = logicalScore[logicalTeam[id]]

    new points =
        completionPoints +
        roundsWon * roundWinPoints +
        performance

    if ((is_ffa_deathmatch() && id == winnerId) ||
        (is_fight_yard() && logicalTeam[id] == winnerTeam) ||
        (!is_full_deathmatch() && logicalTeam[id] == winnerTeam))
        points += winPoints

    return max(0, points)
}

stock write_final_player_stats(winnerTeam, winnerId)
{
    for (new id = 1; id <= 32; id++)
    {
        if (!is_user_connected(id)) continue
        write_player_stats(id, winnerTeam, winnerId, true)
    }
}

stock write_player_stats(id, winnerTeam, winnerId, bool:final)
{
    new eventLog[160], matchId[81], eventLine[448], suffix[48]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine), "{^"match_id^":^"%s^",^"type^":^"player_stats^",^"userid^":%d,^"logical_team^":%d,^"kills^":%d,^"deaths^":%d,^"assists^":%d,^"headshots^":%d,^"damage^":%d,^"grenade_kills^":%d", matchId, id, logicalTeam[id], playerKills[id], playerDeaths[id], playerAssists[id], playerHeadshots[id], playerDamage[id], playerGrenadeKills[id])
    // Operation Points depend on the final result. Disconnect snapshots omit
    // them so the backend can settle the same formula using retained stats.
    // Final FFA stats include completion + performance OP and an individual
    // winner bonus, with no round-win component.
    if (final)
    {
        new operationPoints = operation_points_for_player(id, winnerTeam, winnerId)
        formatex(suffix, charsmax(suffix), ",^"operation_points^":%d}", operationPoints)
        add(eventLine, charsmax(eventLine), suffix)
    }
    else add(eventLine, charsmax(eventLine), "}")
    write_file(eventLog, eventLine, -1)
}

public on_round_start()
{
    if (swappingSides)
        resume_after_side_swap()
    write_event("round_start", 0, "")

    new players[32], count
    get_players(players, count, "ae", "TERRORIST")

    for (new i = 0; i < count; i++)
    {
        new id = players[i]
        if (!is_competitive_bot(id) && user_has_weapon(id, CSW_C4))
        {
            cs_set_user_plant(id, 1, 1)
            return
        }
    }
}

public on_voice_ptt(id)
{
    if (!is_user_connected(id) || is_competitive_bot(id)) return PLUGIN_HANDLED

    new value[4]
    read_argv(1, value, charsmax(value))

    new bool:active
    if (equal(value, "1")) active = true
    else if (equal(value, "0")) active = false
    else return PLUGIN_HANDLED

    set_channel_voice_ptt_state(id, active, false)
    return PLUGIN_HANDLED
}

public on_voice_ptt_down(id)
{
    set_channel_voice_ptt_state(id, true, false)
    return PLUGIN_HANDLED
}

public on_voice_ptt_up(id)
{
    set_channel_voice_ptt_state(id, false, false)
    return PLUGIN_HANDLED
}

public on_team_voice_ptt_down(id)
{
    set_channel_voice_ptt_state(id, true, false)
    return PLUGIN_HANDLED
}

public on_team_voice_ptt_up(id)
{
    set_channel_voice_ptt_state(id, false, false)
    return PLUGIN_HANDLED
}

public on_party_voice_ptt_down(id)
{
    set_channel_voice_ptt_state(id, true, true)
    return PLUGIN_HANDLED
}

public on_party_voice_ptt_up(id)
{
    set_channel_voice_ptt_state(id, false, true)
    return PLUGIN_HANDLED
}

stock set_channel_voice_ptt_state(id, bool:active, bool:party)
{
    if (!is_user_connected(id) || is_competitive_bot(id)) return

    if (party)
    {
        if (partyVoicePttActive[id] == active) return
        partyVoicePttActive[id] = active
        write_voice_ptt_event(id, active, "party")
    }
    else
    {
        if (teamVoicePttActive[id] == active) return
        teamVoicePttActive[id] = active
        write_voice_ptt_event(id, active, "team")
    }

    new bool:anyActive = teamVoicePttActive[id] || partyVoicePttActive[id]
    if (voicePttActive[id] != anyActive)
    {
        voicePttActive[id] = anyActive
        render_voice_ptt_chatter_icon(id, anyActive)
    }

    render_voice_ptt_status(id, active ? (party ? 2 : 1) : 0)
}

public on_location_message(messageId, messageDestination, messageEntity)
{
    new player = get_msg_arg_int(1)
    if (player >= 1 && player <= 32)
    {
        get_msg_arg_string(2, playerLocationName[player], charsmax(playerLocationName[]))
        if (playerLocationName[player][0] == '#')
            copy(playerLocationName[player], charsmax(playerLocationName[]), playerLocationName[player][1])
    }

    // Avoid a duplicate label on clients that do support ReGameDLL's native
    // Location message. Disabling the compatibility HUD restores native behavior.
    return get_cvar_num("competitive_location_hud") ? PLUGIN_HANDLED : PLUGIN_CONTINUE
}

public render_location_hud()
{
    if (!get_cvar_num("competitive_location_hud")) return

    new players[32], count
    get_players(players, count, "ch")

    for (new i = 0; i < count; i++)
    {
        new id = players[i]
        new target = id

        if (!is_user_alive(id))
        {
            target = pev(id, pev_iuser2)
            if (target < 1 || target > 32 || !is_user_connected(target))
            {
                ClearSyncHud(id, locationHudSync)
                continue
            }
        }

        // Use the same NAV lookup as pings, independent of the active bot DLL.
        // Resolve each tick so movement cannot leave an old callout on screen.
        new Float:origin[3], location[32]
        pev(target, pev_origin, origin)
        ping_location(origin, location, charsmax(location))
        if (!location[0] && !pingNavValid)
        {
            // Keep the native server result as fallback for unsupported NAVs.
            get_member(target, m_lastLocation, location, charsmax(location))
            if (location[0] == '#') copy(location, charsmax(location), location[1])
            if (equal(location, "Middle")) copy(location, charsmax(location), "Mid")
        }

        if (!location[0])
        {
            ClearSyncHud(id, locationHudSync)
            continue
        }

        // Green, compact text tucked below the classic top-left radar.
        set_hudmessage(0, 255, 0, 0.01, 0.20, 0, 0.0, 0.65, 0.0, 0.0, -1)
        ShowSyncHudMsg(id, locationHudSync, "%s", location)
    }
}

stock render_voice_ptt_status(id, preferredChannel = 0)
{
    if (!is_user_connected(id)) return

    new channel
    if (preferredChannel == 2 && partyVoicePttActive[id]) channel = 2
    else if (preferredChannel == 1 && teamVoicePttActive[id]) channel = 1
    else if (partyVoicePttActive[id]) channel = 2
    else if (teamVoicePttActive[id]) channel = 1

    if (!channel)
    {
        ClearSyncHud(id, voiceStatusHudSync)
        return
    }

    // Bottom-left, just above the native health/armor HUD.
    set_hudmessage(0, 255, 160, 0.02, 0.82, 0, 0.0, 3600.0, 0.0, 0.0, -1)
    ShowSyncHudMsg(id, voiceStatusHudSync, channel == 2 ? "Talking to: Party" : "Talking to: Team")
}

// YaPB's chatter UI is the client's native BotVoice overlay. It expects two
// bytes: whether the icon is on, then the entity index of its speaker.
// Mirror YaPB's visibility rules: teammates see it; everyone receives an off
// message when a speaker disconnects so no stale icon remains. The speaker is
// also a recipient, so Team PTT still shows with one human plus bot teammates.
stock render_voice_ptt_chatter_icon(id, bool:active, bool:disconnect = false)
{
    new recipients[32], recipientCount
    get_players(recipients, recipientCount, "ch")

    for (new recipientIndex = 0; recipientIndex < recipientCount; recipientIndex++)
    {
        new recipient = recipients[recipientIndex]
        if (!disconnect && (logicalTeam[id] <= 0 || logicalTeam[id] != logicalTeam[recipient])) continue

        message_begin(MSG_ONE, get_user_msgid("BotVoice"), _, recipient)
        write_byte(active ? 1 : 0)
        write_byte(id)
        message_end()
    }
}

stock write_voice_ptt_event(id, bool:active, const channel[])
{
    new playerName[32]
    get_user_name(id, playerName, charsmax(playerName))
    replace_all(playerName, charsmax(playerName), "\\", "\\\\")
    replace_all(playerName, charsmax(playerName), "^"", "'")

    new eventLog[160], matchId[81], eventLine[352]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(
        eventLine,
        charsmax(eventLine),
        "{^"match_id^":^"%s^",^"type^":^"voice_ptt^",^"userid^":%d,^"value^":^"%s^",^"active^":%d,^"channel^":^"%s^"}",
        matchId,
        id,
        playerName,
        active ? 1 : 0,
        channel
    )
    write_file(eventLog, eventLine, -1)
}

stock write_event(const type[], id, const value[])
{
    new safeValue[64]
    copy(safeValue, charsmax(safeValue), value)
    replace_all(safeValue, charsmax(safeValue), "\\", "\\\\")
    replace_all(safeValue, charsmax(safeValue), "^"", "'")
    new eventLog[160], matchId[81], eventLine[320]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine), "{^"match_id^":^"%s^",^"type^":^"%s^",^"userid^":%d,^"value^":^"%s^"}", matchId, type, id, safeValue)
    write_file(eventLog, eventLine, -1)
}

stock write_event_pair(const type[], first, second, third)
{
    new eventLog[160], matchId[81], eventLine[320]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine), "{^"match_id^":^"%s^",^"type^":^"%s^",^"first^":%d,^"second^":%d,^"third^":%d}", matchId, type, first, second, third)
    write_file(eventLog, eventLine, -1)
}

stock write_event_number(const type[], value)
{
    new eventLog[160], matchId[81], eventLine[320]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine), "{^"match_id^":^"%s^",^"type^":^"%s^",^"value^":%d}", matchId, type, value)
    write_file(eventLog, eventLine, -1)
}

stock write_score_event(const type[], winner, teamAScore, teamBScore)
{
    new eventLog[160], matchId[81], eventLine[320]
    get_event_log(eventLog, charsmax(eventLog), matchId, charsmax(matchId))
    formatex(eventLine, charsmax(eventLine), "{^"match_id^":^"%s^",^"type^":^"%s^",^"winner^":%d,^"team_a_score^":%d,^"team_b_score^":%d}", matchId, type, winner, teamAScore, teamBScore)
    write_file(eventLog, eventLine, -1)
}

stock get_event_log(eventLog[], eventLogLength, matchId[], matchIdLength)
{
    get_cvar_string("competitive_match_id", matchId, matchIdLength)
    format(eventLog, eventLogLength, "addons/amxmodx/logs/16competitive-%s.log", matchId)
}

stock clear_damage(victim)
{
    for (new attacker = 1; attacker <= 32; attacker++) damageByPlayer[attacker][victim] = 0
}

// Server-owned, bounded snapshot for the launcher scoreboard bridge. The
// backend may serve it only to players in this live match.
stock preferred_ally_tag_weapon(id)
{
    new weapons[32], weaponCount, secondary = CSW_KNIFE
    get_user_weapons(id, weapons, weaponCount)
    for (new i = 0; i < weaponCount; i++)
    {
        new weapon = weapons[i]
        if (weapon <= 0 || weapon > MAX_CS_WEAPON_ID) continue
        new mask = 1 << weapon
        if (mask & (CSW_ALL_SHOTGUNS | CSW_ALL_SMGS | CSW_ALL_RIFLES | CSW_ALL_SNIPERRIFLES | CSW_ALL_MACHINEGUNS))
            return weapon
        if (mask & CSW_ALL_PISTOLS) secondary = weapon
    }
    return secondary
}

// Show the next loss payout using ReGameDLL's configured reward rules.
stock scoreboard_loss_bonus(CsTeams:team)
{
    return is_full_deathmatch() ? 0 : balance_next_loss(_:team)
}

public write_scoreboard_snapshot()
{
    new directory[192], target[224]
    get_datadir(directory, charsmax(directory))
    formatex(target, charsmax(target), "%s/16c_scoreboard.tsv", directory)
    new file = fopen(target, "wt")
    if (!file) return

    new map[32]
    get_mapname(map, charsmax(map))
    // The UI displays the active round; roundsPlayed counts completed rounds.
    // v15 adds teammate utilities: HE bit 0, flash count bits 1-2, smoke bit 3, kit bit 4.
    // The API redacts possession from the opposing team before forwarding it.
    // Buy time is measured from ReGameDLL's round start in game time.
    new Float:roundStart = get_member_game(m_fRoundStartTime)
    new bool:buytimeActive = !is_full_deathmatch() && roundStart > 0.0
        && get_gametime() - roundStart < get_cvar_float("mp_buytime") * 60.0
    fprintf(file, "#16c-scoreboard-v15^t%s^t%d^t%d^t%s^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%s^t%d^n", map, min(roundsPlayed + (matchLive ? 1 : 0), 99), is_ffa_deathmatch() ? 1 : 0, roundWinners, get_cvar_num("competitive_regulation_half_rounds"), winTarget, logicalScore[logical_team_for_side(CS_TEAM_CT)], logicalScore[logical_team_for_side(CS_TEAM_T)], buytimeActive ? 1 : 0, scoreboard_loss_bonus(CS_TEAM_CT), scoreboard_loss_bonus(CS_TEAM_T), max(1, get_cvar_num("competitive_overtime_half_rounds")), sidesSwapped ? 1 : 0, roundEvents, logical_team_for_side(CS_TEAM_T))

    new name[33], safe[33], ping, loss, count
    new maximum = min(get_maxplayers(), 32)
    for (new id = 1; id <= maximum; id++)
    {
        if (!is_user_connected(id)) continue
        get_user_name(id, name, charsmax(name))
        count = 0
        for (new i = 0; name[i] && count < charsmax(safe); i++)
        {
            if (name[i] < 32 || name[i] == 127) continue
            safe[count++] = name[i]
        }
        safe[count] = 0
        get_user_ping(id, ping, loss)
        // GoldSrc reports zero latency for local bots. Give them a stable
        // display-only value so the board does not show a misleading 0 ms;
        // this snapshot never feeds gameplay or anti-cheat decisions.
        if (is_user_bot(id)) ping = 24 + ((id * 17) % 43)
        new utilities = 0
        if (is_user_alive(id))
        {
            utilities = clamp(cs_get_user_bpammo(id, CSW_HEGRENADE), 0, 1)
                | (clamp(cs_get_user_bpammo(id, CSW_FLASHBANG), 0, 2) << 1)
                | (clamp(cs_get_user_bpammo(id, CSW_SMOKEGRENADE), 0, 1) << 3)
                | (cs_get_user_defuse(id) ? 16 : 0)
        }
        fprintf(file, "%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%d^t%s^n", id,
            get_user_team(id), playerKills[id], playerAssists[id], playerDeaths[id],
            max(0, ping), is_user_alive(id) ? 1 : 0, is_user_bot(id) ? 1 : 0,
            clamp(cs_get_user_money(id), 0, 16000), preferred_ally_tag_weapon(id),
            clamp(get_user_health(id), 0, 255), cs_get_user_buyzone(id) ? 1 : 0,
            get_user_team(id) == 1 && is_user_alive(id) && user_has_weapon(id, CSW_C4) ? 1 : 0, utilities, safe)
    }
    fclose(file)
}

// Only the local match worker writes this marker after durable cancellation.
public check_match_termination()
{
    if (!matchTerminated)
    {
        if (!file_exists("competitive_match_terminated.flag")) return
        new marker[32], length
        read_file("competitive_match_terminated.flag", 0, marker, charsmax(marker), length)
        trim(marker)
        if (!equal(marker, "CHEATING_CONFIRMED")) return
        matchTerminated = true
        cancel_ffa_respawns()
        matchLive = false
        remove_task(TASK_LOCATION_HUD)
        client_print(0, print_chat, "[1.6 Competitive] MATCH TERMINATED - Cheating detected. No MMR change.")
        set_server_name("MATCH TERMINATED")
    }
    set_hudmessage(255, 60, 60, -1.0, 0.32, 0, 0.0, 1.0, 0.0, 0.0, 4)
    show_hudmessage(0, "MATCH TERMINATED^nA cheater has been detected.^nThe match is invalid. No MMR change.")
    for (new id = 1; id <= 32; id++)
    {
        if (!is_user_alive(id)) continue
        set_pev(id, pev_flags, pev(id, pev_flags) | FL_FROZEN)
        set_user_godmode(id, 1)
    }
}
