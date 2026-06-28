const store = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k) => (k in store ? store[k] : null)),
  setItemAsync: jest.fn(async (k, v) => {
    store[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k) => {
    delete store[k];
  }),
  __reset: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
}));
