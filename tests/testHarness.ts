export async function runTestCase(
    name: string,
    fn: () => void | Promise<void>,
): Promise<void> {
    console.log(`[TEST] ${name}`);
    try {
        await fn();
        console.log(`[PASS] ${name}`);
    } catch (error) {
        console.log(`[FAIL] ${name}`);
        throw error;
    }
}
