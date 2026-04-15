"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestCoachInsight = requestCoachInsight;
const DEFAULT_ENDPOINT = "https://opencode.ai/zen/v1/chat/completions";
const DEFAULT_MODEL = "minimax-m2.5-free";
async function requestCoachInsight(params) {
    const key = process.env.OPEN_CODE_KEY;
    const endpoint = process.env.OPEN_CODE_ENDPOINT || DEFAULT_ENDPOINT;
    const model = process.env.OPEN_CODE_MODEL || DEFAULT_MODEL;
    if (!key) {
        return {
            ply: params.ply,
            timestamp: new Date().toISOString(),
            summary: "Coach disabled: OPEN_CODE_KEY not set."
        };
    }
    const recent = params.moves.slice(-16).map((m) => `${m.ply}. ${m.engine}: ${m.moveUci}`).join("\n");
    const body = {
        model,
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: "You are a chess coach. Analyze style and practical mistakes from move history. Keep it concise and actionable with bullet points."
            },
            {
                role: "user",
                content: `Give coaching feedback after ply ${params.ply}.\nCurrent FEN: ${params.fen}\nRecent moves:\n${recent || "(none)"}\n\nOutput format:\n1) Style notes\n2) Tactical warning\n3) One concrete tuning idea for evaluation/search.`
            }
        ]
    };
    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const txt = await res.text();
            return {
                ply: params.ply,
                timestamp: new Date().toISOString(),
                summary: `Coach request failed (${res.status}): ${txt.slice(0, 240)}`
            };
        }
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || "No coach response content.";
        return {
            ply: params.ply,
            timestamp: new Date().toISOString(),
            summary: String(content)
        };
    }
    catch (err) {
        return {
            ply: params.ply,
            timestamp: new Date().toISOString(),
            summary: `Coach request error: ${err?.message || "unknown"}`
        };
    }
}
