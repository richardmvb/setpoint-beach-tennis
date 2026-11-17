import { connectivityContract } from './connectivity.contract';
import { FakeConnectivity } from './connectivity.fake';

connectivityContract('FakeConnectivity', () => {
  const connectivity = new FakeConnectivity();
  return { connectivity, change: (online) => connectivity.set(online) };
});
