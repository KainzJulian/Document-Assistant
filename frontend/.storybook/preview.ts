import type { Preview } from '@storybook/angular-vite';

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Design',
      toolbar: {
        title: 'Design',
        dynamicTitle: true,
        items: [
          { value: 'light', title: 'Hell' },
          { value: 'dark', title: 'Dunkel' },
        ],
      },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [
    (story, context) => {
      // The app switches themes with the "dark" class on <html>; stories do the same.
      document.documentElement.classList.toggle('dark', context.globals['theme'] === 'dark');
      return story();
    },
  ],
  parameters: {
    layout: 'padded',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'error',
    },
  },
};

export default preview;
