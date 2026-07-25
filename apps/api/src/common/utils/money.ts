export function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Сравнение сумм после округления до копеек. Пороги оплаты (paidIn >= revenue
// и т.п.) складывают несколько платежей через reduce без промежуточного
// округления — из-за погрешности плавающей точки итог может оказаться на
// исчезающе малую долю меньше ожидаемого (99.99999999999999 вместо 100) и не
// пройти обычное сравнение, хотя по смыслу сумма оплачена полностью.
export function moneyGte(a: number, b: number): boolean {
    return money(a) >= money(b);
}
