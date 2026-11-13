import { expect, test } from './support/fixtures';

/**
 * Pins the computed value of every design token in both themes. The tokens live in src/styles/tokens.css;
 * when a value is changed on purpose, change it here in the same commit so the diff shows the intent.
 *
 * History: the tokens were first pinned as they were in styles.css. The restyle then changed two light-theme values
 * for WCAG AA contrast (`--muted` #6f7a74 to #56615c, `--danger` #b8463b to #9f3a30) and added the spacing, radius,
 * elevation and motion scales plus `--accent-text`, `--success-text` and `--focus`. The dialog added `--on-danger` (text on a solid danger button; dark
 * theme needs dark text, white on its light red fails contrast). The shared view added `--on-orange` (text on the solid
 * orange live badge; white on it fails contrast in both themes). `--ease`, `--font-display` and
 * `--shadow` only changed notation when they moved out of styles.css (Stylelint's modern syntax).
 */
const LIGHT: Record<string, string> = {
  '--accent-text': '#7d5c28',
  '--bg': '#f3f1ec',
  '--border': '#e6e2d9',
  '--danger': '#9f3a30',
  '--duration-base': '200ms',
  '--duration-fast': '120ms',
  '--ease': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  '--focus': '#1d5a49',
  '--font-display': '"Manrope", sans-serif',
  '--green': '#0f2f27',
  '--green-2': '#1d5a49',
  '--green-soft': '#e6efea',
  '--muted': '#56615c',
  '--on-danger': '#fff',
  '--on-orange': '#14211c',
  '--orange': '#b98a3e',
  '--orange-soft': '#f6ecd8',
  '--radius': '18px',
  '--radius-full': '999px',
  '--radius-lg': '16px',
  '--radius-md': '12px',
  '--radius-sm': '8px',
  '--radius-xl': '24px',
  '--rank-bronze': '#f0d7c2',
  '--rank-gold': '#fff1b8',
  '--rank-silver': '#e7eaed',
  '--shadow': '0 1px 2px rgb(20 33 28 / 4%), 0 12px 32px -12px rgb(20 33 28 / 12%)',
  '--shadow-lg': '0 24px 60px -20px rgb(20 33 28 / 35%)',
  '--shadow-md': '0 1px 2px rgb(20 33 28 / 4%), 0 12px 32px -12px rgb(20 33 28 / 12%)',
  '--shadow-sm': '0 1px 2px rgb(20 33 28 / 8%)',
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '20px',
  '--space-6': '24px',
  '--space-7': '32px',
  '--space-8': '40px',
  '--success-text': '#276b4d',
  '--surface': '#fff',
  '--surface-soft': '#f7f5f0',
  '--text': '#14211c',
  'color-scheme': 'light',
  'font-family': '"DM Sans", sans-serif',
};

const DARK: Record<string, string> = {
  '--accent-text': '#d9ae62',
  '--bg': '#0c1411',
  '--border': '#25362d',
  '--danger': '#ff8c7d',
  '--duration-base': '200ms',
  '--duration-fast': '120ms',
  '--ease': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  '--focus': '#bfe3d0',
  '--font-display': '"Manrope", sans-serif',
  '--green': '#1d5a49',
  '--green-2': '#bfe3d0',
  '--green-soft': '#1d3329',
  '--muted': '#93a39a',
  '--on-danger': '#2b0e0a',
  '--on-orange': '#14211c',
  '--orange': '#d9ae62',
  '--orange-soft': '#33291a',
  '--radius': '18px',
  '--radius-full': '999px',
  '--radius-lg': '16px',
  '--radius-md': '12px',
  '--radius-sm': '8px',
  '--radius-xl': '24px',
  '--rank-bronze': '#503728',
  '--rank-gold': '#51431a',
  '--rank-silver': '#3b4248',
  '--shadow': '0 1px 2px rgb(0 0 0 / 30%), 0 16px 36px -16px rgb(0 0 0 / 50%)',
  '--shadow-lg': '0 24px 60px -20px rgb(0 0 0 / 70%)',
  '--shadow-md': '0 1px 2px rgb(0 0 0 / 30%), 0 16px 36px -16px rgb(0 0 0 / 50%)',
  '--shadow-sm': '0 1px 2px rgb(0 0 0 / 40%)',
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-5': '20px',
  '--space-6': '24px',
  '--space-7': '32px',
  '--space-8': '40px',
  '--success-text': '#5cc99a',
  '--surface': '#142019',
  '--surface-soft': '#1a2921',
  '--text': '#eef3ef',
  'color-scheme': 'dark',
  'font-family': '"DM Sans", sans-serif',
};

test.describe('design tokens', () => {
  for (const [theme, expected] of [
    ['light', LIGHT],
    ['dark', DARK],
  ] as const) {
    test(`${theme} theme: every token has its pinned value`, async ({ page }) => {
      await page.goto('/');
      const actual = await page.evaluate(
        ({ names, theme: value }) => {
          if (value === 'dark') document.documentElement.dataset['theme'] = 'dark';
          else delete document.documentElement.dataset['theme'];
          const style = getComputedStyle(document.documentElement);
          return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
        },
        { names: Object.keys(expected), theme },
      );
      expect(actual).toEqual(expected);
    });
  }
});
