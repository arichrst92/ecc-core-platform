import type { Config } from 'tailwindcss';

/**
 * Brand palette ECC — sama dengan portal supaya konsisten visual identity.
 * Primary orange dari logo, accent yellow, plus warna IDEA biru untuk footer.
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        accent: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        idea: {
          DEFAULT: '#0046FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
