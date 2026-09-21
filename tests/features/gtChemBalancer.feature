Feature: GregTech Chemical Equation Balancer
  As a GregTech modpack player
  I want to balance chemical reaction equations with dust, fluid, and catalyst annotations
  So that I can determine correct stoichiometric recipe ratios

  Scenario: Balancing an unbalanced chemical reaction with state annotations
    Given an unbalanced chemical equation "Na2O (d) + H2O => NaOH (d)"
    When the equation balancer processes the input
    Then the equation is marked as unbalanced initially
    And the resulting balanced equation is "3Na2O (d) + H2O (f) => 6NaOH (d)"

  Scenario: Validating an already balanced chemical reaction
    Given a balanced chemical equation "2H2 (f) + O2 (f) => 2H2O (f)"
    When the equation balancer processes the input
    Then the equation is marked as already balanced
    And the balanced equation string matches the original equation

  Scenario: Balancing a reaction containing catalysts
    Given an equation with a catalyst "H2 + O2 + Ni (c) => H2O + Ni (c)"
    When the equation balancer processes the input
    Then the catalyst "Ni (c)" is preserved on both sides of the reaction
    And the balanced equation is "2H2 (f) + O2 (f) + Ni (c) => 2H2O (f) + Ni (c)"

  Scenario: Quick balance check function returns boolean status
    When isBalancedChemicalEquation is evaluated for "Na2O (d) + H2O => NaOH (d)"
    Then the return value is false
