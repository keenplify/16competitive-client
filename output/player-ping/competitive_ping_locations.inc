// GoldSrc NAV v5 place lookup at the ping position (not the sender's position).
// Layout follows ReGameDLL_CS regamedll/game_shared/bot/nav_file.cpp.
// Parse once per map, fail closed for missing, malformed, or other NAV versions.
#define PING_NAV_MAX_AREAS 4096
#define PING_NAV_MAX_PLACES 256
new pingNavCount, pingNavSize, bool:pingNavValid
new pingNavPlaces[PING_NAV_MAX_PLACES + 1][32]
new Float:pingNavBounds[PING_NAV_MAX_AREAS][8], pingNavPlace[PING_NAV_MAX_AREAS]

stock ping_nav_read(file, size)
{
    new value
    if (!pingNavValid || ftell(file) + size > pingNavSize || fread(file, value, size) != size)
    {
        pingNavValid = false
        return 0
    }
    // AMXX reads narrow integers as signed; NAV counts/place IDs are unsigned.
    if (size == BLOCK_CHAR) return value & 0xFF
    if (size == BLOCK_SHORT) return value & 0xFFFF
    return value
}

stock ping_nav_skip(file, bytes)
{
    if (!pingNavValid || bytes < 0 || ftell(file) + bytes > pingNavSize)
        pingNavValid = false
    else fseek(file, bytes, SEEK_CUR)
}

stock ping_load_locations()
{
    pingNavCount = 0
    pingNavValid = false
    new map[64], path[96]
    get_mapname(map, charsmax(map))
    formatex(path, charsmax(path), "maps/%s.nav", map)
    new file = fopen(path, "rb")
    if (!file) { log_amx("[Player Ping] No callout NAV: %s", path); return; }
    pingNavSize = file_size(path)
    pingNavValid = true
    if (ping_nav_read(file, BLOCK_INT) != 0xFEEDFACE || ping_nav_read(file, BLOCK_INT) != 5)
    {
        fclose(file)
        pingNavValid = false
        log_amx("[Player Ping] Unsupported or invalid NAV header: %s (requires v5)", path)
        return
    }
    ping_nav_skip(file, 4) // BSP size
    new places = ping_nav_read(file, BLOCK_SHORT)
    if (places < 0 || places > PING_NAV_MAX_PLACES) pingNavValid = false
    for (new place = 1; place <= places && pingNavValid; place++)
    {
        new length = ping_nav_read(file, BLOCK_SHORT)
        if (length <= 0 || length > 256) { pingNavValid = false; break; }
        for (new c = 0; c < length; c++)
        {
            new value = ping_nav_read(file, BLOCK_CHAR)
            if (c < charsmax(pingNavPlaces[])) pingNavPlaces[place][c] = value
        }
    }
    new count = ping_nav_read(file, BLOCK_INT)
    if (count < 0 || count > PING_NAV_MAX_AREAS) pingNavValid = false
    for (new area = 0; area < count && pingNavValid; area++)
    {
        ping_nav_skip(file, 5) // area ID and attribute flags
        for (new c = 0; c < 8; c++)
            pingNavBounds[area][c] = Float:ping_nav_read(file, BLOCK_INT)
        for (new dir = 0; dir < 4 && pingNavValid; dir++)
        {
            new connections = ping_nav_read(file, BLOCK_INT)
            if (connections < 0 || connections > PING_NAV_MAX_AREAS) pingNavValid = false
            else ping_nav_skip(file, connections * 4)
        }
        ping_nav_skip(file, ping_nav_read(file, BLOCK_CHAR) * 17) // hiding spots
        ping_nav_skip(file, ping_nav_read(file, BLOCK_CHAR) * 14) // approach areas
        new encounters = ping_nav_read(file, BLOCK_INT)
        if (encounters < 0 || encounters > 65536) pingNavValid = false
        for (new e = 0; e < encounters && pingNavValid; e++)
        {
            ping_nav_skip(file, 10) // from ID/direction, to ID/direction
            ping_nav_skip(file, ping_nav_read(file, BLOCK_CHAR) * 5)
        }
        pingNavPlace[area] = ping_nav_read(file, BLOCK_SHORT)
        if (pingNavPlace[area] < 0 || pingNavPlace[area] > places) pingNavValid = false
    }
    fclose(file)
    pingNavCount = pingNavValid ? count : 0
    if (!pingNavValid) log_amx("[Player Ping] Malformed callout NAV: %s", path)
    else {
        new named = 0
        for (new area = 0; area < count; area++) if (pingNavPlace[area]) named++
        log_amx("[Player Ping] Loaded %s: %d areas, %d named, %d places", path, count, named, places)
    }
}

stock ping_location(const Float:point[3], location[], length)
{
    location[0] = 0
    new nearest = -1
    new Float:best = 128.0 * 128.0
    for (new area = 0; area < pingNavCount; area++)
    {
        if (!pingNavPlace[area]) continue
        new Float:x = floatclamp(point[0], pingNavBounds[area][0], pingNavBounds[area][3])
        new Float:y = floatclamp(point[1], pingNavBounds[area][1], pingNavBounds[area][4])
        new Float:width = pingNavBounds[area][3] - pingNavBounds[area][0]
        new Float:height = pingNavBounds[area][4] - pingNavBounds[area][1]
        new Float:u = width > 0.0 ? (x - pingNavBounds[area][0]) / width : 0.0
        new Float:v = height > 0.0 ? (y - pingNavBounds[area][1]) / height : 0.0
        new Float:z = (1.0-v) * ((1.0-u)*pingNavBounds[area][2] + u*pingNavBounds[area][6])
            + v * ((1.0-u)*pingNavBounds[area][7] + u*pingNavBounds[area][5])
        new Float:dx = x-point[0], Float:dy = y-point[1], Float:dz = z-point[2]
        new Float:distance = dx*dx + dy*dy + dz*dz
        if (distance < best) { best = distance; nearest = area; }
    }
    if (nearest >= 0)
    {
        copy(location, length, pingNavPlaces[pingNavPlace[nearest]])
        if (equal(location, "Middle")) copy(location, length, "Mid")
    }
}
