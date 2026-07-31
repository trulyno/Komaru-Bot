export function runTestCase(name: string, fn: () => void): void {
    console.log(`[TEST] ${name}`);
    try {
        fn();
        console.log(`[PASS] ${name}`);
    } catch (error) {
        console.log(`[FAIL] ${name}`);
        throw error;
    }
}
