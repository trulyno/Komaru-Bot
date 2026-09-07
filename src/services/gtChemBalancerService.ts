export type EquationState = 'dust' | 'fluid' | 'catalyst';

export interface ParsedMember {
    formula: string;
    state: EquationState;
    coefficient: number;
    atomCount: number;
    atomCounts: Map<string, number>;
}

export interface ParsedEquation {
    reactants: ParsedMember[];
    products: ParsedMember[];
    arrow: string;
}

export interface BalanceResult {
    isBalanced: boolean;
    balancedEquation: string;
    originalEquation: string;
    reason: string;
}

export function parseFormula(formula: string): Map<string, number> {
    const stack: Array<Map<string, number>> = [new Map<string, number>()];

    let index = 0;
    while (index < formula.length) {
        const char = formula[index];
        if (char === '(') {
            stack.push(new Map<string, number>());
            index += 1;
        } else if (char === ')') {
            const multiplier = readMultiplier(formula, index + 1);
            const inner = stack.pop()!;
            const parent = stack[stack.length - 1];
            for (const [element, count] of inner.entries()) {
                parent.set(element, (parent.get(element) ?? 0) + count * multiplier.number);
            }
            index += multiplier.length + 1;
        } else if (/[A-Z]/.test(char)) {
            let element = char;
            index += 1;
            while (index < formula.length && /[a-z]/.test(formula[index])) {
                element += formula[index];
                index += 1;
            }
            const multiplier = readMultiplier(formula, index);
            const count = multiplier.number || 1;
            stack[stack.length - 1].set(
                element,
                (stack[stack.length - 1].get(element) ?? 0) + count,
            );
            index += multiplier.length;
        } else {
            index += 1;
        }
    }

    return new Map(stack[0].entries());
}

function readMultiplier(formula: string, startIndex: number): { number: number; length: number } {
    let index = startIndex;
    while (index < formula.length && /\d/.test(formula[index])) {
        index += 1;
    }
    const digits = formula.slice(startIndex, index);
    return { number: digits ? Number(digits) : 1, length: digits.length };
}

export function getTotalAtomCount(formula: string): number {
    const counts = parseFormula(formula);
    return Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
}

export function parseEquation(input: string): ParsedEquation {
    const normalized = input.trim().replace(/\s+/g, ' ');
    let arrow = '=>';
    let splitIndex = -1;

    if (normalized.includes('->')) {
        splitIndex = normalized.indexOf('->');
        arrow = '->';
    } else if (normalized.includes('→')) {
        splitIndex = normalized.indexOf('→');
        arrow = '→';
    } else if (normalized.includes('=>')) {
        splitIndex = normalized.indexOf('=>');
        arrow = '=>';
    }

    if (splitIndex < 0) {
        throw new Error('No arrow found in equation. Use ->, →, or =>');
    }

    const left = normalized.slice(0, splitIndex).trim();
    const right = normalized.slice(splitIndex + arrow.length).trim();

    const parseSide = (side: string): ParsedMember[] => {
        return side
            .split('+')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const suffixMatch = part.match(/\s*\((d|f|c|nc)\)\s*$/i);
                let suffix = '';
                let content = part;
                if (suffixMatch) {
                    suffix = suffixMatch[1].toLowerCase();
                    content = part.slice(0, suffixMatch.index).trim();
                }

                const coefficientMatch = content.match(/^(\d+)\s*(.+)$/);
                const coefficient = coefficientMatch ? Number(coefficientMatch[1]) : 1;
                const formula = coefficientMatch ? coefficientMatch[2].trim() : content.trim();

                let state: EquationState = 'fluid';
                if (suffix === 'd') {
                    state = 'dust';
                } else if (suffix === 'c' || suffix === 'nc') {
                    state = 'catalyst';
                }

                return {
                    formula,
                    state,
                    coefficient,
                    atomCount: getTotalAtomCount(formula),
                    atomCounts: parseFormula(formula),
                };
            });
    };

    return {
        reactants: parseSide(left),
        products: parseSide(right),
        arrow,
    };
}

export function getUniqueElements(reactants: ParsedMember[], products: ParsedMember[]): string[] {
    const elements = new Set<string>();
    for (const member of [...reactants, ...products]) {
        for (const element of member.atomCounts.keys()) {
            elements.add(element);
        }
    }
    return Array.from(elements).sort();
}

export function getEffectiveQuantity(member: ParsedMember, coefficient: number): number {
    if (member.state === 'dust') {
        return coefficient / member.atomCount;
    }
    return coefficient;
}

export function isBalancedWithCoefficients(
    reactants: ParsedMember[],
    products: ParsedMember[],
    coefficients: number[],
): boolean {
    const elements = getUniqueElements(reactants, products);
    for (const element of elements) {
        let leftCount = 0;
        let rightCount = 0;
        reactants.forEach((member, index) => {
            leftCount +=
                (member.atomCounts.get(element) ?? 0) *
                getEffectiveQuantity(member, coefficients[index]);
        });
        products.forEach((member, index) => {
            rightCount +=
                (member.atomCounts.get(element) ?? 0) *
                getEffectiveQuantity(member, coefficients[reactants.length + index]);
        });
        if (Math.abs(leftCount - rightCount) > 1e-9) {
            return false;
        }
    }
    return true;
}

export function findBalancedCoefficients(
    reactants: ParsedMember[],
    products: ParsedMember[],
): number[] | null {
    const activeReactants = reactants.filter((member) => member.state !== 'catalyst');
    const activeProducts = products.filter((member) => member.state !== 'catalyst');
    const compounds = [...activeReactants, ...activeProducts];
    const coefficients = Array(compounds.length).fill(1);
    const maxCoefficient = 12;

    function search(index: number): number[] | null {
        if (index === compounds.length) {
            return isBalancedWithCoefficients(activeReactants, activeProducts, coefficients)
                ? [...coefficients]
                : null;
        }

        for (let value = 1; value <= maxCoefficient; value += 1) {
            coefficients[index] = value;
            const result = search(index + 1);
            if (result) {
                return result;
            }
        }

        return null;
    }

    return search(0);
}

export function formatMember(member: ParsedMember, coefficient: number): string {
    const suffix = member.state === 'dust' ? '(d)' : member.state === 'catalyst' ? '(c)' : '(f)';
    const prefix = coefficient === 1 ? '' : String(coefficient);
    return `${prefix}${member.formula} ${suffix}`;
}

export function formatEquationWithCatalysts(
    parsed: ParsedEquation,
    coefficients: number[],
): string {
    const activeCoefficients = coefficients.slice(
        0,
        parsed.reactants.length + parsed.products.length,
    );
    const reactantParts = parsed.reactants.map((member, index) => {
        const coefficient = member.state === 'catalyst' ? 1 : activeCoefficients[index];
        return formatMember(member, coefficient);
    });
    const productParts = parsed.products.map((member, index) => {
        const coefficient =
            member.state === 'catalyst' ? 1 : activeCoefficients[parsed.reactants.length + index];
        return formatMember(member, coefficient);
    });
    return `${reactantParts.join(' + ')} ${parsed.arrow} ${productParts.join(' + ')}`;
}

export function balanceChemicalEquation(input: string): BalanceResult {
    const parsed = parseEquation(input);
    const activeReactants = parsed.reactants.filter((member) => member.state !== 'catalyst');
    const activeProducts = parsed.products.filter((member) => member.state !== 'catalyst');

    if (activeReactants.length === 0 || activeProducts.length === 0) {
        return {
            isBalanced: true,
            balancedEquation: input.trim(),
            originalEquation: input.trim(),
            reason: 'No balancing candidates found.',
        };
    }

    const initialCoefficients = [
        ...activeReactants.map((member) => member.coefficient),
        ...activeProducts.map((member) => member.coefficient),
    ];
    const isAlreadyBalanced = isBalancedWithCoefficients(
        activeReactants,
        activeProducts,
        initialCoefficients,
    );
    if (isAlreadyBalanced) {
        return {
            isBalanced: true,
            balancedEquation: input.trim(),
            originalEquation: input.trim(),
            reason: 'The equation is already balanced.',
        };
    }

    const balancedCoefficients = findBalancedCoefficients(activeReactants, activeProducts);
    if (!balancedCoefficients) {
        return {
            isBalanced: false,
            balancedEquation: input.trim(),
            originalEquation: input.trim(),
            reason: 'Unable to solve the equation.',
        };
    }

    const fullCoefficients = Array(parsed.reactants.length + parsed.products.length).fill(1);
    let reactantIndex = 0;
    parsed.reactants.forEach((member, index) => {
        if (member.state === 'catalyst') {
            return;
        }
        fullCoefficients[index] = balancedCoefficients[reactantIndex];
        reactantIndex += 1;
    });

    let productIndex = 0;
    parsed.products.forEach((member, index) => {
        if (member.state === 'catalyst') {
            return;
        }
        fullCoefficients[parsed.reactants.length + index] =
            balancedCoefficients[activeReactants.length + productIndex];
        productIndex += 1;
    });

    const balancedEquation = formatEquationWithCatalysts(
        {
            reactants: parsed.reactants,
            products: parsed.products,
            arrow: parsed.arrow,
        },
        fullCoefficients,
    );

    return {
        isBalanced: false,
        balancedEquation,
        originalEquation: input.trim(),
        reason: 'Balanced with dust/fluid/catalyst rules applied.',
    };
}

export function isBalancedChemicalEquation(input: string): boolean {
    try {
        const parsed = parseEquation(input);
        const reactants = parsed.reactants.filter((member) => member.state !== 'catalyst');
        const products = parsed.products.filter((member) => member.state !== 'catalyst');
        if (reactants.length === 0 || products.length === 0) {
            return true;
        }
        return isBalancedWithCoefficients(reactants, products, [
            ...reactants.map((member) => member.coefficient),
            ...products.map((member) => member.coefficient),
        ]);
    } catch {
        return false;
    }
}
