// src/auth/authMachine.ts
import { AuthState, AuthEvent } from "./authTypes";

/**
 * Pure state machine reducer for authentication flow
 * No React, no side effects - fully testable and auditable
 */
export function authReducer(
    state: AuthState,
    event: AuthEvent
): AuthState {
    switch (state) {
        case "DISCONNECTED":
            if (event.type === "CONNECT_WALLET") return "CONNECTING_WALLET";
            // Allow direct connect (e.g. Reown auto-reconnect skips the connecting phase)
            if (event.type === "WALLET_CONNECTED") return "WALLET_CONNECTED";
            return state;

        case "CONNECTING_WALLET":
            if (event.type === "WALLET_CONNECTED") return "WALLET_CONNECTED";
            if (event.type === "DISCONNECT") return "DISCONNECTED";
            return state;

        case "WALLET_CONNECTED":
            if (event.type === "PROFILE_LOADING") return "LOADING_PROFILE";
            if (event.type === "DISCONNECT") return "DISCONNECTED";
            return state;

        case "LOADING_PROFILE":
            if (event.type === "PROFILE_FOUND") return "AUTHENTICATED";
            if (event.type === "PROFILE_MISSING") return "NEEDS_PROFILE";
            if (event.type === "DISCONNECT") return "DISCONNECTED";
            return state;

        case "NEEDS_PROFILE":
            if (event.type === "PROFILE_FOUND") return "AUTHENTICATED";
            if (event.type === "DISCONNECT") return "DISCONNECTED";
            return state;

        case "AUTHENTICATED":
            if (event.type === "DISCONNECT") return "DISCONNECTED";
            return state;

        default:
            return state;
    }
}
