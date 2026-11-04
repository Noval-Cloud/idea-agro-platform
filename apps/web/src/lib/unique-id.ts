let made = 0;

/** An id no other element of the page shares, for components a page renders more than once. */
export const uniqueId = (prefix: string) => `${prefix}-${++made}`;
