export type Toast = { id: number; text: string };

/** The toasts once `toast` joins them: the newest last, one per text, at most `limit`. */
export const withToast = (toasts: Toast[], toast: Toast, limit = 3): Toast[] =>
  [...toasts.filter((shown) => shown.text !== toast.text), toast].slice(-limit);
