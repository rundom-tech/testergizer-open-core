// src/core/executors/TargetHydrator.ts

export class TargetHydrator {
    /**
     * Hydrates a target locator string by interpolating parameters from the current Maestro execution context.
     * This bridges the gap between AweMG's dynamic matrix generation and the execution engine.
     * * @param target - The raw locator string, potentially containing {{PARAM_NAME}} tokens.
     * @param variables - The key-value dictionary of the current test execution state.
     * @returns The fully resolved string ready for the Playwright engine.
     */
    public static hydrateLocator(target: string, variables?: Record<string, any>): string {
        if (!target || !variables || Object.keys(variables).length === 0) {
            return target;
        }

        const hydratedSelector = target.replace(/\{\{([^{}]+)\}\}/g, (match, paramName) => {
            const cleanParamName = paramName.trim();
            // If the parameter exists in the context, inject it. Otherwise, leave the token intact.
            return variables[cleanParamName] !== undefined ? String(variables[cleanParamName]) : match;
        });

        return hydratedSelector;
    }
}