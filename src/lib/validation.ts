/**
 * Input Validation and Sanitization Utilities for Streaming
 * Prevents XSS, injection attacks, and ensures data integrity
 */

// Stream metadata constraints
export const STREAM_CONSTRAINTS = {
    TITLE: {
        MIN_LENGTH: 1,
        MAX_LENGTH: 100,
        PATTERN: /^[a-zA-Z0-9\s\-_!?.,'"()&]+$/,
    },
    CATEGORY: {
        MAX_LENGTH: 50,
        ALLOWED: [
            'Gaming',
            'Art',
            'Music',
            'Just Chatting',
            'NFTs',
            'DeFi',
            'Crypto News',
            'Education',
            'IRL',
            'Tech',
        ] as const,
    },
    DESCRIPTION: {
        MAX_LENGTH: 500,
    },
} as const;

export type StreamCategory = typeof STREAM_CONSTRAINTS.CATEGORY.ALLOWED[number];

// Banned words/phrases for stream titles
const BANNED_PHRASES = [
    'scam',
    'free money',
    'send crypto',
    'airdrop',
    '100x guaranteed',
    // Add more as needed
];

/**
 * Sanitizes HTML to prevent XSS attacks
 */
export function sanitizeHTML(input: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };

    return input.replace(/[&<>"'/]/g, (char) => map[char] || char);
}

/**
 * Removes potentially dangerous characters from strings
 */
export function sanitizeInput(input: string): string {
    // Remove null bytes
    let cleaned = input.replace(/\0/g, '');

    // Remove control characters except newline and tab
    // eslint-disable-next-line no-control-regex
    cleaned = cleaned.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

    // Trim whitespace
    cleaned = cleaned.trim();

    return cleaned;
}

/**
 * Validates stream title
 */
export interface ValidationResult {
    isValid: boolean;
    error?: string;
    sanitized?: string;
}

export function validateStreamTitle(title: string): ValidationResult {
    // Sanitize first
    const sanitized = sanitizeInput(title);

    // Check length
    if (sanitized.length < STREAM_CONSTRAINTS.TITLE.MIN_LENGTH) {
        return {
            isValid: false,
            error: 'Stream title is required',
        };
    }

    if (sanitized.length > STREAM_CONSTRAINTS.TITLE.MAX_LENGTH) {
        return {
            isValid: false,
            error: `Stream title must be ${STREAM_CONSTRAINTS.TITLE.MAX_LENGTH} characters or less`,
        };
    }

    // Check pattern
    if (!STREAM_CONSTRAINTS.TITLE.PATTERN.test(sanitized)) {
        return {
            isValid: false,
            error: 'Stream title contains invalid characters',
        };
    }

    // Check for banned phrases
    const lowerTitle = sanitized.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
        if (lowerTitle.includes(phrase.toLowerCase())) {
            return {
                isValid: false,
                error: 'Stream title contains prohibited content',
            };
        }
    }

    return {
        isValid: true,
        sanitized,
    };
}

/**
 * Validates stream category
 */
export function validateStreamCategory(category: string | null): ValidationResult {
    if (!category) {
        return { isValid: true }; // Category is optional
    }

    const sanitized = sanitizeInput(category);
    const allowedCategories: readonly string[] = STREAM_CONSTRAINTS.CATEGORY.ALLOWED;

    if (!allowedCategories.includes(sanitized)) {
        return {
            isValid: false,
            error: 'Invalid category selected',
        };
    }

    return {
        isValid: true,
        sanitized,
    };
}

/**
 * Validates stream description
 */
export function validateStreamDescription(description: string | null): ValidationResult {
    if (!description) {
        return { isValid: true }; // Description is optional
    }

    const sanitized = sanitizeInput(description);

    if (sanitized.length > STREAM_CONSTRAINTS.DESCRIPTION.MAX_LENGTH) {
        return {
            isValid: false,
            error: `Description must be ${STREAM_CONSTRAINTS.DESCRIPTION.MAX_LENGTH} characters or less`,
        };
    }

    return {
        isValid: true,
        sanitized,
    };
}

/**
 * Validates complete stream metadata
 */
export interface StreamMetadata {
    title: string;
    category?: string | null;
    description?: string | null;
    thumbnailUrl?: string | null;
}

export interface ValidationErrors {
    title?: string;
    category?: string;
    description?: string;
    thumbnailUrl?: string;
}

export function validateStreamMetadata(metadata: StreamMetadata): {
    isValid: boolean;
    errors: ValidationErrors;
    sanitized: StreamMetadata;
} {
    const errors: ValidationErrors = {};
    const sanitized: StreamMetadata = { title: '' };

    // Validate title
    const titleResult = validateStreamTitle(metadata.title);
    if (!titleResult.isValid) {
        errors.title = titleResult.error;
    } else {
        sanitized.title = titleResult.sanitized!;
    }

    // Validate category
    if (metadata.category) {
        const categoryResult = validateStreamCategory(metadata.category);
        if (!categoryResult.isValid) {
            errors.category = categoryResult.error;
        } else {
            sanitized.category = categoryResult.sanitized;
        }
    }

    // Validate description
    if (metadata.description) {
        const descResult = validateStreamDescription(metadata.description);
        if (!descResult.isValid) {
            errors.description = descResult.error;
        } else {
            sanitized.description = descResult.sanitized;
        }
    }

    // Validate thumbnail URL
    if (metadata.thumbnailUrl) {
        const urlResult = validateURL(metadata.thumbnailUrl);
        if (!urlResult.isValid) {
            errors.thumbnailUrl = urlResult.error;
        } else {
            sanitized.thumbnailUrl = urlResult.sanitized;
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors,
        sanitized,
    };
}

/**
 * Validates URLs (for thumbnails, etc.)
 */
export function validateURL(url: string): ValidationResult {
    try {
        const parsed = new URL(url);

        // Only allow HTTPS
        if (parsed.protocol !== 'https:') {
            return {
                isValid: false,
                error: 'URL must use HTTPS protocol',
            };
        }

        // Validate domain (could add whitelist here)
        const allowedDomains = [
            'supabase.co',
            'cloudflare.com',
            'cloudflare-ipfs.com',    // Cloudflare IPFS gateway
            'dweb.link',              // Cloudflare IPFS fallback
            'w3s.link',               // web3.storage gateway
            'ipfs.io',                // Public IPFS gateway
            'imgur.com',
            'cloudinary.com',
            // Add your CDN domains
        ];

        const hostname = parsed.hostname;
        const isAllowed = allowedDomains.some(domain =>
            hostname === domain || hostname.endsWith(`.${domain}`)
        );

        if (!isAllowed) {
            return {
                isValid: false,
                error: 'URL domain not allowed',
            };
        }

        return {
            isValid: true,
            sanitized: url,
        };
    } catch {
        return {
            isValid: false,
            error: 'Invalid URL format',
        };
    }
}

/**
 * Rate limit check result
 */
export interface RateLimitStatus {
    canCreate: boolean;
    hourlyRemaining: number;
    dailyRemaining: number;
    hoursUntilReset?: number;
}

/**
 * Checks if stream creation is allowed (client-side check)
 * Note: Server-side validation is authoritative
 */
export function checkClientRateLimit(streamsCreatedToday: number, streamsCreatedThisHour: number): RateLimitStatus {
    const HOURLY_LIMIT = 3;
    const DAILY_LIMIT = 10;

    const hourlyRemaining = Math.max(0, HOURLY_LIMIT - streamsCreatedThisHour);
    const dailyRemaining = Math.max(0, DAILY_LIMIT - streamsCreatedToday);

    const canCreate = hourlyRemaining > 0 && dailyRemaining > 0;

    return {
        canCreate,
        hourlyRemaining,
        dailyRemaining,
    };
}

/**
 * Validates room ID format (for WebRTC)
 */
export function validateRoomId(roomId: string): ValidationResult {
    // UUIDs or alphanumeric IDs only
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const alphanumericPattern = /^[a-zA-Z0-9_-]{8,64}$/;

    if (!uuidPattern.test(roomId) && !alphanumericPattern.test(roomId)) {
        return {
            isValid: false,
            error: 'Invalid room ID format',
        };
    }

    return {
        isValid: true,
        sanitized: roomId,
    };
}

/**
 * Content security policy helper
 * Generates safe CSP headers for stream metadata
 */
export function generateSafeCSP(_metadata: StreamMetadata): string {
    const directives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // For React
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "media-src 'self' https:",
        "connect-src 'self' wss: https:",
        "frame-src 'self'",
    ];

    return directives.join('; ');
}

/**
 * Detects potential abuse patterns
 */
export function detectAbusePatterns(title: string, previousTitles: string[]): {
    isAbuse: boolean;
    reason?: string;
} {
    // Check for spam (same title repeatedly)
    if (previousTitles.filter(t => t === title).length >= 3) {
        return {
            isAbuse: true,
            reason: 'Repeated identical titles detected',
        };
    }

    // Check for all caps (excessive)
    if (title.length > 10 && title === title.toUpperCase()) {
        return {
            isAbuse: true,
            reason: 'Excessive use of capital letters',
        };
    }

    // Check for excessive special characters
    const specialCharCount = (title.match(/[!?]{2,}/g) || []).length;
    if (specialCharCount > 3) {
        return {
            isAbuse: true,
            reason: 'Excessive special characters',
        };
    }

    return {
        isAbuse: false,
    };
}
