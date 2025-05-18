import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5174',
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
    // Можно указать здесь папку со спеками, если она не стандартная
    // specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}'
  },
});
