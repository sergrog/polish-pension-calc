describe('Pension Calculator', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173');
  });

  it('should calculate pension prediction', () => {
    // Проверяем наличие формы
    cy.contains('Kalkulator Emerytalny');
    
    // Заполняем форму
    cy.get('input[name="birthYear"]').clear().type('1980');
    cy.get('input[name="workYears"]').clear().type('25');
    cy.get('input[name="avgSalary"]').clear().type('5000');
    
    // Нажимаем кнопку расчета
    cy.contains('Oblicz').click();
    
    // Проверяем результаты
    cy.contains('Prognoza emerytury').should('be.visible');
    cy.get('svg').should('exist'); // Проверяем наличие графика
  });

  it('should validate input fields', () => {
    // Проверяем валидацию пустых полей
    cy.contains('Oblicz').click();
    cy.get('input[name="birthYear"]').should('have.value', '1980'); // Проверяем значение по умолчанию
    
    // Проверяем ввод некорректных значений
    cy.get('input[name="workYears"]').clear().type('-5');
    cy.get('input[name="avgSalary"]').clear().type('0');
    cy.contains('Oblicz').click();
  });
}); 