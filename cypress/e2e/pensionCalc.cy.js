describe('Pension Calculator', () => {
  it('calculates and displays pension forecast', () => {
    cy.visit('/')
    cy.get('input[label="Возраст"]').type('40')
    cy.get('input[label="Стаж (лет)"]').type('20')
    cy.get('input[label="Средняя зарплата (PLN)"]').type('5000')
    cy.contains('Рассчитать пенсию').click()
    cy.contains('Прогноз пенсии на 25 лет').should('exist')
    cy.get('svg').should('exist') // график
  })
}) 