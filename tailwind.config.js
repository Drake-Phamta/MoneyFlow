/** @type {import('tailwindcss').Config} */
// Màu trỏ vào biến CSS trong src/styles/tokens.css. Nền tối đổi biến, không
// đổi tên lớp — nên mọi chỗ đã viết `text-slate-800` đều tự theo.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'slate': {
                '50': 'rgb(var(--c-slate-50) / <alpha-value>)',
                '100': 'rgb(var(--c-slate-100) / <alpha-value>)',
                '200': 'rgb(var(--c-slate-200) / <alpha-value>)',
                '300': 'rgb(var(--c-slate-300) / <alpha-value>)',
                '400': 'rgb(var(--c-slate-400) / <alpha-value>)',
                '500': 'rgb(var(--c-slate-500) / <alpha-value>)',
                '600': 'rgb(var(--c-slate-600) / <alpha-value>)',
                '700': 'rgb(var(--c-slate-700) / <alpha-value>)',
                '800': 'rgb(var(--c-slate-800) / <alpha-value>)',
                '900': 'rgb(var(--c-slate-900) / <alpha-value>)'
        },
        'primary': {
                '50': 'rgb(var(--c-primary-50) / <alpha-value>)',
                '100': 'rgb(var(--c-primary-100) / <alpha-value>)',
                '200': 'rgb(var(--c-primary-200) / <alpha-value>)',
                '300': 'rgb(var(--c-primary-300) / <alpha-value>)',
                '400': 'rgb(var(--c-primary-400) / <alpha-value>)',
                '500': 'rgb(var(--c-primary-500) / <alpha-value>)',
                '600': 'rgb(var(--c-primary-600) / <alpha-value>)',
                '700': 'rgb(var(--c-primary-700) / <alpha-value>)',
                '800': 'rgb(var(--c-primary-800) / <alpha-value>)',
                '900': 'rgb(var(--c-primary-900) / <alpha-value>)'
        },
        'blue': {
                '50': 'rgb(var(--c-blue-50) / <alpha-value>)',
                '100': 'rgb(var(--c-blue-100) / <alpha-value>)',
                '200': 'rgb(var(--c-blue-200) / <alpha-value>)',
                '300': 'rgb(var(--c-blue-300) / <alpha-value>)',
                '400': 'rgb(var(--c-blue-400) / <alpha-value>)',
                '500': 'rgb(var(--c-blue-500) / <alpha-value>)',
                '600': 'rgb(var(--c-blue-600) / <alpha-value>)',
                '700': 'rgb(var(--c-blue-700) / <alpha-value>)',
                '800': 'rgb(var(--c-blue-800) / <alpha-value>)',
                '900': 'rgb(var(--c-blue-900) / <alpha-value>)'
        },
        'emerald': {
                '50': 'rgb(var(--c-emerald-50) / <alpha-value>)',
                '100': 'rgb(var(--c-emerald-100) / <alpha-value>)',
                '200': 'rgb(var(--c-emerald-200) / <alpha-value>)',
                '300': 'rgb(var(--c-emerald-300) / <alpha-value>)',
                '400': 'rgb(var(--c-emerald-400) / <alpha-value>)',
                '500': 'rgb(var(--c-emerald-500) / <alpha-value>)',
                '600': 'rgb(var(--c-emerald-600) / <alpha-value>)',
                '700': 'rgb(var(--c-emerald-700) / <alpha-value>)',
                '800': 'rgb(var(--c-emerald-800) / <alpha-value>)',
                '900': 'rgb(var(--c-emerald-900) / <alpha-value>)'
        },
        'amber': {
                '50': 'rgb(var(--c-amber-50) / <alpha-value>)',
                '100': 'rgb(var(--c-amber-100) / <alpha-value>)',
                '200': 'rgb(var(--c-amber-200) / <alpha-value>)',
                '300': 'rgb(var(--c-amber-300) / <alpha-value>)',
                '400': 'rgb(var(--c-amber-400) / <alpha-value>)',
                '500': 'rgb(var(--c-amber-500) / <alpha-value>)',
                '600': 'rgb(var(--c-amber-600) / <alpha-value>)',
                '700': 'rgb(var(--c-amber-700) / <alpha-value>)',
                '800': 'rgb(var(--c-amber-800) / <alpha-value>)',
                '900': 'rgb(var(--c-amber-900) / <alpha-value>)'
        },
        'red': {
                '50': 'rgb(var(--c-red-50) / <alpha-value>)',
                '100': 'rgb(var(--c-red-100) / <alpha-value>)',
                '200': 'rgb(var(--c-red-200) / <alpha-value>)',
                '300': 'rgb(var(--c-red-300) / <alpha-value>)',
                '400': 'rgb(var(--c-red-400) / <alpha-value>)',
                '500': 'rgb(var(--c-red-500) / <alpha-value>)',
                '600': 'rgb(var(--c-red-600) / <alpha-value>)',
                '700': 'rgb(var(--c-red-700) / <alpha-value>)',
                '800': 'rgb(var(--c-red-800) / <alpha-value>)',
                '900': 'rgb(var(--c-red-900) / <alpha-value>)'
        },
        'violet': {
                '50': 'rgb(var(--c-violet-50) / <alpha-value>)',
                '100': 'rgb(var(--c-violet-100) / <alpha-value>)',
                '200': 'rgb(var(--c-violet-200) / <alpha-value>)',
                '300': 'rgb(var(--c-violet-300) / <alpha-value>)',
                '400': 'rgb(var(--c-violet-400) / <alpha-value>)',
                '500': 'rgb(var(--c-violet-500) / <alpha-value>)',
                '600': 'rgb(var(--c-violet-600) / <alpha-value>)',
                '700': 'rgb(var(--c-violet-700) / <alpha-value>)',
                '800': 'rgb(var(--c-violet-800) / <alpha-value>)',
                '900': 'rgb(var(--c-violet-900) / <alpha-value>)'
        },
        'orange': {
                '50': 'rgb(var(--c-orange-50) / <alpha-value>)',
                '100': 'rgb(var(--c-orange-100) / <alpha-value>)',
                '200': 'rgb(var(--c-orange-200) / <alpha-value>)',
                '300': 'rgb(var(--c-orange-300) / <alpha-value>)',
                '400': 'rgb(var(--c-orange-400) / <alpha-value>)',
                '500': 'rgb(var(--c-orange-500) / <alpha-value>)',
                '600': 'rgb(var(--c-orange-600) / <alpha-value>)',
                '700': 'rgb(var(--c-orange-700) / <alpha-value>)',
                '800': 'rgb(var(--c-orange-800) / <alpha-value>)',
                '900': 'rgb(var(--c-orange-900) / <alpha-value>)'
        },
        'rose': {
                '50': 'rgb(var(--c-rose-50) / <alpha-value>)',
                '100': 'rgb(var(--c-rose-100) / <alpha-value>)',
                '200': 'rgb(var(--c-rose-200) / <alpha-value>)',
                '300': 'rgb(var(--c-rose-300) / <alpha-value>)',
                '400': 'rgb(var(--c-rose-400) / <alpha-value>)',
                '500': 'rgb(var(--c-rose-500) / <alpha-value>)',
                '600': 'rgb(var(--c-rose-600) / <alpha-value>)',
                '700': 'rgb(var(--c-rose-700) / <alpha-value>)',
                '800': 'rgb(var(--c-rose-800) / <alpha-value>)',
                '900': 'rgb(var(--c-rose-900) / <alpha-value>)'
        },
        'yellow': {
                '50': 'rgb(var(--c-yellow-50) / <alpha-value>)',
                '100': 'rgb(var(--c-yellow-100) / <alpha-value>)',
                '200': 'rgb(var(--c-yellow-200) / <alpha-value>)',
                '300': 'rgb(var(--c-yellow-300) / <alpha-value>)',
                '400': 'rgb(var(--c-yellow-400) / <alpha-value>)',
                '500': 'rgb(var(--c-yellow-500) / <alpha-value>)',
                '600': 'rgb(var(--c-yellow-600) / <alpha-value>)',
                '700': 'rgb(var(--c-yellow-700) / <alpha-value>)',
                '800': 'rgb(var(--c-yellow-800) / <alpha-value>)',
                '900': 'rgb(var(--c-yellow-900) / <alpha-value>)'
        },
        'white': 'rgb(var(--c-white) / <alpha-value>)',
        'black': 'rgb(var(--c-black) / <alpha-value>)',
        'page': 'rgb(var(--c-page) / <alpha-value>)',
        'surface': 'rgb(var(--c-surface) / <alpha-value>)'
},
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        'fs-1': 'var(--fs-1)',
        'fs-2': 'var(--fs-2)',
        'fs-3': 'var(--fs-3)',
        'fs-4': 'var(--fs-4)',
        'fs-5': 'var(--fs-5)',
        'fs-6': 'var(--fs-6)',
        'fs-7': 'var(--fs-7)',
        'fs-8': 'var(--fs-8)',
      },
      borderRadius: {
        input: 'var(--r-input)',
        card: 'var(--r-card)',
      },
    },
  },
  plugins: [],
};
