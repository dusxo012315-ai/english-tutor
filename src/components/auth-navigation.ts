// Authentication boundaries require a full document load to discard private React state.
export function navigateAuthBoundary(destination: "/" | "/login") {
  location.assign(destination);
}
