// RegUserMsg through Fakemeta reaches the engine but bypasses Metamod's
// user-message name registry. AMXX message_begin rejects these otherwise valid
// IDs. Begin through the same engine API; the normal writers/end use that API.
stock ping_send_message(recipient, owner, kind, const Float:point[3])
{
    if (pingMessage <= 0 || !is_user_connected(recipient)) return
    static const Float:zero[3] = {0.0, 0.0, 0.0}
    engfunc(EngFunc_MessageBegin, MSG_ONE, pingMessage, zero, recipient)
    write_byte(owner)
    write_byte(kind)
    engfunc(EngFunc_WriteCoord, point[0])
    engfunc(EngFunc_WriteCoord, point[1])
    engfunc(EngFunc_WriteCoord, point[2])
    message_end()
}
