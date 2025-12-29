/** @type {import('tailwindcss').Config} */
module.exports = {
  // Aqui está o segredo: ele vai ler tudo dentro de src/views
  content: ["./src/views/**/*.ejs"], 
  theme: {
    extend: {},
  },
  plugins: [],
}