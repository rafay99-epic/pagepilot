// Formatters shared by more than one view.
export const shortDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
