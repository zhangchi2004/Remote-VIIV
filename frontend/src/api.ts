export const API_BASE = "/api";
export const WS_BASE = "/ws"; // Vite proxy handles this

export async function createGame(roomName: string) {
    const res = await fetch(`${API_BASE}/games/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_name: roomName })
    });
    return res.json();
}

export async function joinGame(roomName: string, playerName: string) {
    const res = await fetch(`${API_BASE}/games/${roomName}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName })
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json(); // { player_id: string, team: number }
}

export async function startGame(roomName: string) {
    const res = await fetch(`${API_BASE}/games/${roomName}/start`, {
        method: "POST"
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

export async function getState(roomName: string, playerId: string) {
     const res = await fetch(`${API_BASE}/games/${roomName}/state/${playerId}`);
     if (!res.ok) throw new Error(await res.text());
     return res.json();
}