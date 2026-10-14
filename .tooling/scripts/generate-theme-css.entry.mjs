export { voiceForceThemeConfigSchema } from '../../src/theme/schema.ts';
export { voiceforceBaselineConfig } from '../../src/theme/configs/voiceforce.config.ts';
// Session 7.11 — the KATON customer configuration, exported alongside
// VoiceForce's so the generator script can select between them by name.
export { katonConfig } from '../../src/theme/configs/katon.config.ts';
export { generateRootDeclarations, generateDarkDeclarations, renderDeclarationBlock } from '../../src/theme/generateCssVariables.ts';
