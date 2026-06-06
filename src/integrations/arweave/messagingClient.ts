import {
    uploadMetadataToArweave,
    getIrysMutableUrl,
    queryIrysByTags
} from "@/integrations/arweave/legacyClient";

/**
 * Decentralized Message Structure
 */
export interface DecentralizedMessage {
    id?: string;
    context_id: string; // The "Room" or "Conversation" ID
    sender_address: string;
    sender_name: string;
    content: string;
    message_type: 'text' | 'sticker' | 'emoji';
    sticker_url?: string;
    sticker_name?: string;
    timestamp: string;
    signature?: string;
}

/**
 * Discovery tags for Messaging on Arweave
 */
export const getMessageTags = (message: DecentralizedMessage) => [
    { name: "App-Name", value: "TheLilyPad_Messaging" },
    { name: "Content-Type", value: "application/json" },
    { name: "Type", value: "Chat_Message" },
    { name: "Context-ID", value: message.context_id },
    { name: "Sender", value: message.sender_address.toLowerCase() },
    { name: "Message-Type", value: message.message_type },
    { name: "Version", value: "V1" }
];

/**
 * Fetches decentralized messages for a specific context (room/conversation)
 */
export async function getDecentralizedMessages(
    contextId: string,
    limit = 50
): Promise<DecentralizedMessage[]> {
    try {
        console.log(`[ArweaveMsg] Fetching messages for context: ${contextId}...`);

        const queryTags = [
            { name: "App-Name", values: ["TheLilyPad_Messaging"] },
            { name: "Type", values: ["Chat_Message"] },
            { name: "Context-ID", values: [contextId] }
        ];

        // Fetch from Arweave via Irys GQL
        const results = await queryIrysByTags(queryTags, limit, "DESC");

        if (!results || results.length === 0) return [];

        // Parse results
        const messages: DecentralizedMessage[] = [];

        // For messages, we don't necessarily need mutable URLs unless we want to edit messages.
        // Direct transaction data is better for an immutable chat log.
        // We'll fetch the JSON for each message. 
        // Note: For high performance, we might want to leverage a dedicated aggregator, 
        // but for decentralization, direct GQL + Fetch is the way.

        const fetchPromises = results.map(async (edge) => {
            try {
                // Fetch the actual JSON content from the Arweave gateway
                const url = `https://arweave.net/${edge.node.id}`;
                const response = await fetch(url);
                if (!response.ok) return null;
                const data = await response.json();
                return {
                    ...data,
                    id: edge.node.id, // The Arweave TX ID acts as the unique message ID
                    timestamp: data.timestamp || new Date(edge.node.receipt.timestamp).toISOString()
                } as DecentralizedMessage;
            } catch (e) {
                return null;
            }
        });

        const resolved = await Promise.all(fetchPromises);
        return resolved
            .filter((m): m is DecentralizedMessage => m !== null)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    } catch (e) {
        console.warn("[ArweaveMsg] Fetch failed:", e);
        return [];
    }
}

/**
 * Sends a decentralized message to Arweave.
 */
export async function sendDecentralizedMessage(
    message: Omit<DecentralizedMessage, 'id' | 'timestamp'>,
    wallet: any
): Promise<string> {
    if (!wallet.address) throw new Error("Wallet connection required to send message");

    console.log(`[ArweaveMsg] Sending message to context ${message.context_id}...`);

    const fullMessage: DecentralizedMessage = {
        ...message,
        sender_address: wallet.address,
        timestamp: new Date().toISOString()
    };

    const tags = getMessageTags(fullMessage);

    // We use immutable uploads for individual messages (standard practice for chat)
    const txUri = await uploadMetadataToArweave(
        fullMessage,
        wallet,
        false, // isMutable = false (messages should be immutable records)
        undefined,
        tags
    );

    const txId = txUri.split('/').pop() || txUri;
    console.log(`[ArweaveMsg] Message sent. TX ID: ${txId}`);
    return txId;
}
