import { localLiveContract } from './local-live.contract';
import { FakeLocalLive } from './local-live.fake';

localLiveContract('FakeLocalLive', () => {
  const fake = new FakeLocalLive();
  return { port: fake, given: (token, snapshot) => fake.given(token, snapshot), fail: (code) => fake.fail(code) };
});
