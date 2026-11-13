import { expect, test } from './support/fixtures';

/**
 * Pins the computed value of every design token in both themes. The tokens live in src/styles/tokens.css;
 * when a value is changed on purpose, change it here in the same commit so the diff shows the intent.
 * `--ease`, `--font-display` and `--shadow` were rewritten when the tokens moved out of styles.css (whitespace, leading
 * zeros and `rgb(r g b / a%)` notation required by Stylelint); their colors and numbers are the same as before.
 */
const LIGHT: Record<string, string> = {
  '--bg': '#f3f1ec',
  '--border': '#e6e2d9',
  '--danger': '#b8463b',
  '--ease': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  '--font-display': '"Manrope", sans-serif',
  '--green': '#0f2f27',
  '--green-2': '#1d5a49',
  '--green-soft': '#e6efea',
  '--muted': '#6f7a74',
  '--orange': '#b98a3e',
  '--orange-soft': '#f6ecd8',
  '--radius': '18px',
  '--rank-bronze': '#f0d7c2',
  '--rank-gold': '#fff1b8',
  '--rank-silver': '#e7eaed',
  '--shadow': '0 1px 2px rgb(20 33 28 / 4%), 0 12px 32px -12px rgb(20 33 28 / 12%)',
  '--surface': '#fff',
  '--surface-soft': '#f7f5f0',
  '--text': '#14211c',
  'color-scheme': 'light',
  'font-family': '"DM Sans", sans-serif',
};

const DARK: Record<string, string> = {
  '--bg': '#0c1411',
  '--border': '#25362d',
  '--danger': '#ff8c7d',
  '--ease': 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  '--font-display': '"Manrope", sans-serif',
  '--green': '#1d5a49',
  '--green-2': '#bfe3d0',
  '--green-soft': '#1d3329',
  '--muted': '#93a39a',
  '--orange': '#d9ae62',
  '--orange-soft': '#33291a',
  '--radius': '18px',
  '--rank-bronze': '#503728',
  '--rank-gold': '#51431a',
  '--rank-silver': '#3b4248',
  '--shadow': '0 1px 2px rgb(0 0 0 / 30%), 0 16px 36px -16px rgb(0 0 0 / 50%)',
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
