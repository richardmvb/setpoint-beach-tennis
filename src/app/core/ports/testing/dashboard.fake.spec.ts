import { dashboardContract } from './dashboard.contract';
import { FakeDashboard } from './dashboard.fake';

dashboardContract('FakeDashboard', () => {
  const fake = new FakeDashboard();
  return { port: fake, given: (source, tournament) => fake.given(source, tournament), fail: (code) => fake.fail(code) };
});
