/**
 * SafeStyle utility - CSS value validation for XSS prevention
 * 
 * These helpers ensure user-controlled values cannot inject malicious CSS
 * or execute arbitrary code through style injection attacks.
 */

/** Valid CSS color formats: hex, rgb(), rgba(), hsl(), hsla(), named colors */
const VALID_COLOR_PATTERN = /^(#[0-9A-Fa-f]{3,8}|rgb\([^)]*\)|rgba\([^)]*\)|hsl\([^)]*\)|hsl[a]?\([^)]*\)|[a-zA-Z-]+)$/;

/** Valid CSS length units */
const VALID_LENGTH_PATTERN = /^(\d+(\.\d+)?(px|em|rem|%|vh|vw|vmin|vmax|ex|ch|cm|mm|in|pt|pc)|0)$/;

/** Valid percentage values */
const VALID_PERCENTAGE_PATTERN = /^(\d+(\.\d+)?%|0)$/;

/**
 * Validates a CSS color value.
 * Returns the color if valid, or a safe default if invalid.
 * 
 * @param value - The CSS color value to validate
 * @param defaultValue - Safe fallback (default: 'transparent')
 * @returns Validated color string
 */
export function validateColor(value: string, defaultValue = 'transparent'): string {
  if (!value || typeof value !== 'string') {
    return defaultValue;
  }
  
  // Trim whitespace
  const trimmed = value.trim();
  
  // Check against allowed pattern
  if (VALID_COLOR_PATTERN.test(trimmed)) {
    return trimmed;
  }
  
  // Log suspicious input for debugging (in dev only)
  if (import.meta.env.DEV) {
    console.warn('[SafeStyle] Rejected invalid color value:', value);
  }
  
  return defaultValue;
}

/**
 * Validates a CSS length value.
 * 
 * @param value - The CSS length value to validate
 * @param defaultValue - Safe fallback (default: '0')
 * @returns Validated length string
 */
export function validateLength(value: string, defaultValue = '0'): string {
  if (!value || typeof value !== 'string') {
    return defaultValue;
  }
  
  const trimmed = value.trim();
  
  if (VALID_LENGTH_PATTERN.test(trimmed)) {
    return trimmed;
  }
  
  if (import.meta.env.DEV) {
    console.warn('[SafeStyle] Rejected invalid length value:', value);
  }
  
  return defaultValue;
}

/**
 * Validates a CSS percentage value.
 * 
 * @param value - The percentage value to validate
 * @param defaultValue - Safe fallback (default: '0%')
 * @returns Validated percentage string
 */
export function validatePercentage(value: string | number, defaultValue = '0%'): string {
  if (typeof value === 'number') {
    return `${Math.max(0, Math.min(100, value))}%`;
  }
  
  if (!value || typeof value !== 'string') {
    return defaultValue;
  }
  
  const trimmed = value.trim();
  
  if (VALID_PERCENTAGE_PATTERN.test(trimmed)) {
    return trimmed;
  }
  
  if (import.meta.env.DEV) {
    console.warn('[SafeStyle] Rejected invalid percentage value:', value);
  }
  
  return defaultValue;
}

/**
 * Validates a CSS opacity value (0-1).
 * 
 * @param value - The opacity value to validate
 * @param defaultValue - Safe fallback (default: 1)
 * @returns Validated opacity number
 */
export function validateOpacity(value: string | number, defaultValue = 1): number {
  if (typeof value === 'number') {
    return Math.max(0, Math.min(1, value));
  }
  
  if (!value || typeof value !== 'string') {
    return defaultValue;
  }
  
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  
  return Math.max(0, Math.min(1, parsed));
}

/**
 * Creates a safe inline style object by validating all values.
 * Only allows specific CSS properties and validates their values.
 * 
 * @param styles - Object containing CSS property/value pairs
 * @returns Sanitized style object safe for React style prop
 */
export function createSafeStyles(styles: Record<string, string | number | undefined>): React.CSSProperties {
  const safe: React.CSSProperties = {};
  
  for (const [key, value] of Object.entries(styles)) {
    if (value === undefined || value === null) continue;
    
    // Property allowlist - only these can be set dynamically
    const allowedProperties = [
      'opacity',
      'width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'top', 'right', 'bottom', 'left',
      'borderRadius', 'borderWidth',
      'fontSize', 'lineHeight',
      'zIndex',
      'transitionDuration', 'transitionDelay', 'animationDuration', 'animationDelay'
    ] as const;
    
    if (!allowedProperties.includes(key as typeof allowedProperties[number])) {
      if (import.meta.env.DEV) {
        console.warn('[SafeStyle] Rejected unsafe CSS property:', key);
      }
      continue;
    }
    
    // Validate based on property type
    if (key === 'opacity') {
      (safe as Record<string, number>)[key] = validateOpacity(value);
    } else if (key === 'zIndex') {
      const num = typeof value === 'string' ? parseInt(value, 10) : value;
      (safe as Record<string, number>)[key] = isNaN(num) ? 0 : num;
    } else if (typeof value === 'string') {
      // For lengths, percentages, and other string values
      if (value.includes('<') || value.includes('>') || value.includes('url(')) {
        // Block potential XSS vectors
        if (import.meta.env.DEV) {
          console.warn('[SafeStyle] Rejected potentially dangerous CSS value:', key, value);
        }
        continue;
      }
      (safe as Record<string, string>)[key] = value;
    } else {
      (safe as Record<string, number>)[key] = value;
    }
  }
  
  return safe;
}

/**
 * Sanitizes a className string to prevent injection.
 * Removes any potentially dangerous characters.
 * 
 * @param className - The className string to sanitize
 * @returns Sanitized className safe for use in React
 */
export function sanitizeClassName(className: string): string {
  if (!className || typeof className !== 'string') {
    return '';
  }
  
  // Remove any characters that could break out of the class attribute
  // Only allow: letters, numbers, spaces, hyphens, underscores, colons (for Tailwind)
  return className.replace(/[^a-zA-Z0-9\s\-_:[\]()%./]/g, '');
}

/** 
 * Predefined safe color palette for theme usage.
 * Use these instead of accepting arbitrary color values from user input.
 */
export const SAFE_COLORS = {
  // Primary
  emerald: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  amber: '#f59e0b',
  red: '#ef4444',
  
  // Extended
  cyan: '#22d3ee',
  violet: '#a855f7',
  fuchsia: '#d946ef',
  orange: '#f97316',
  rose: '#f43f5e',
  
  // Grays
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent'
} as const;

export type SafeColor = typeof SAFE_COLORS[keyof typeof SAFE_COLORS];

/**
 * Validates that a color is in the safe palette.
 * 
 * @param color - Color to validate
 * @param defaultColor - Fallback color
 * @returns A safe color value
 */
export function getSafeColor(color: string, defaultColor: SafeColor = SAFE_COLORS.transparent): SafeColor {
  const normalized = color?.toLowerCase().trim();
  
  const isSafe = Object.values(SAFE_COLORS).includes(normalized as SafeColor);
  
  if (isSafe) {
    return normalized as SafeColor;
  }
  
  if (import.meta.env.DEV) {
    console.warn('[SafeStyle] Color not in safe palette, using default:', color);
  }
  
  return defaultColor;
}
