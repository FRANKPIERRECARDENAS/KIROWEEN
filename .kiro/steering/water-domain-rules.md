# Reglas de Dominio Hídrico y Estándares Técnicos (Steering)

1. **Honestidad Epistémica**: Distingue siempre entre evidencia medida, inferencia algorítmica, incertidumbre y datos faltantes.
2. **Transparencia de Datos Sintéticos**: Todos los sensores pre-cargados de la red comunitaria *San Cristóbal de las Aguas* deben etiquetarse explícitamente como datos sintéticos de demostración.
3. **Independencia Operativa**: Ningún flujo crítico (detección de fugas, priorización, órdenes de trabajo, ledger SHA-256 o modo offline) puede bloquearse por ausencia de API keys o conectividad externa.
4. **Cero Afirmaciones No Validadas**: No declarar ahorros reales de agua ni certificaciones sanitarias automáticas sin validación de campo.
5. **Integridad de Código**: Lógica pura desacoplada en `src/core/`, cubierta por pruebas `node:test`, tipado estricto TypeScript y verificación continua mediante `tsc --noEmit` y `vite build`.
