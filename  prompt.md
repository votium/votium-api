Quiero realizar una refactorización arquitectónica profunda del proyecto. No quiero que implementes ningún cambio todavía.

Tu primera tarea consiste únicamente en analizar el estado actual del repositorio y generar un plan de migración detallado.

## Objetivo

El proyecto utiliza NestJS y actualmente intenta seguir Clean Architecture, pero la implementación no cumple completamente con el estándar arquitectónico que deseo adoptar.

El objetivo es migrar gradualmente el proyecto hacia una arquitectura consistente, escalable, desacoplada y fácilmente testeable.

Además de Clean Architecture, quiero comenzar a incorporar principios de Domain Driven Design (DDD), sin aumentar innecesariamente la complejidad del proyecto.

No quiero un Big Bang Refactor. Quiero una migración incremental.

---

# Arquitectura objetivo

Cada dominio deberá tener la siguiente estructura:

src/
    modules/
        <domain>/
            domain/
            application/
            infrastructure/
            presentation/

No quiero organizar el proyecto por entidades.

Quiero organizarlo por dominios (Bounded Contexts).

Por ejemplo, actualmente existen:

- users
- roles
- auth

Si durante el análisis identificas que User y Role pertenecen al mismo dominio, deberán agruparse bajo un mismo módulo de dominio.

No quiero que esta decisión sea arbitraria.

Analiza las responsabilidades actuales y propone la mejor organización.

---

# Clean Architecture

Cada dominio deberá seguir estrictamente las siguientes capas:

- domain
- application
- infrastructure
- presentation

No deben existir dependencias que violen la dirección de dependencias de Clean Architecture.

---

# Domain

Esta capa deberá ser completamente independiente de NestJS y de cualquier framework.

Aquí vivirán únicamente:

- Entities
- Value Objects
- Repository Interfaces
- Domain Exceptions
- lógica de negocio
- reglas del dominio

Las entidades deberán centralizar su creación.

Actualmente estoy considerando dos alternativas:

Opción A

create(...)
restore(...)

como métodos estáticos.

Opción B

Factory Method.

Analiza cuál alternativa es más apropiada para este proyecto.

Si Factory Method únicamente agrega complejidad sin aportar beneficios reales, prefiero mantener create() y restore().

Justifica la decisión.

Las entidades podrán contener comportamiento de negocio cuando corresponda.

No quiero entidades anémicas.

---

# Domain Exceptions

Quiero reemplazar completamente el concepto de Error por Exception.

Actualmente existen DomainError, ValidationError, etc.

Quiero migrar a:

DomainException

como clase base.

La implementación objetivo es:

```ts
export abstract class DomainException extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);

    this.name = new.target.name;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

No quiero statusCode dentro del dominio.

Los códigos HTTP pertenecen a Presentation.

Cada excepción concreta deberá definir únicamente:

code
message

Repository Interfaces

Los repositorios deberán permanecer dentro del dominio.

Cada repositorio deberá exportar su propio Injection Token como string.

Ejemplo:

export const PRODUCT_REPOSITORY = 'PRODUCT_REPOSITORY';

No quiero archivos separados únicamente para tokens.

Application

Aquí vivirán únicamente:

Use Cases
DTOs del caso de uso

Los casos de uso contendrán la orquestación del dominio.

No deberán contener lógica de infraestructura.

Infrastructure

Inicialmente solo existirá persistence.

Aquí vivirán:

Prisma Repositories
Mappers de persistencia

Los repositorios implementarán las interfaces definidas en Domain.

Los mappers serán responsables de convertir:

Prisma -> Domain

Domain -> Prisma

No quiero lógica de negocio aquí.

Presentation

Aquí vivirán:

Controllers
DTOs HTTP
Presenters

Los Presenters serán responsables de transformar las respuestas de los casos de uso al formato HTTP.

No quiero lógica de negocio en Controllers.

Global Exception Filter

Quiero modificar completamente el manejo de excepciones.

Las DomainException no conocerán códigos HTTP.

El ExceptionFilter será quien traduzca:

DomainException.code

hacia

HttpStatus

mediante un mapa.

Analiza si esta implementación es adecuada o si propones una alternativa mejor.

Shared

Existe un módulo Shared.

Allí permanecerán únicamente componentes reutilizables como:

PrismaService
GlobalExceptionFilter
respuestas paginadas
utilidades comunes

No quiero mover lógica de negocio aquí.

Respuestas paginadas

Quiero estandarizar completamente las respuestas paginadas.

Existe una implementación inicial que deberá mantenerse como base.

Analiza si requiere mejoras.

Patrones de diseño

Quiero aplicar patrones únicamente cuando aporten valor.

No quiero sobreingeniería.

Puedes utilizar, cuando realmente sean útiles:

Factory Method
Abstract Factory
Builder
Singleton
Adapter
Facade
Decorator
Command
Strategy

Puedes proponer otros patrones si justificas claramente su beneficio.

Si un patrón únicamente agrega complejidad, no debe utilizarse.

Justifica todas las decisiones.

DDD

Quiero comenzar a aplicar principios de Domain Driven Design.

No pretendo implementar DDD completo.

Únicamente quiero adoptar aquellas prácticas que aporten claridad al proyecto.

Durante el análisis identifica oportunidades para incorporar conceptos como:

Bounded Contexts
Aggregates
Domain Services
Value Objects
Domain Events (solo si realmente aportan valor)

No quiero introducir complejidad innecesaria.

Calidad

El nuevo diseño debe favorecer:

escalabilidad
mantenibilidad
desacoplamiento
legibilidad
facilidad para realizar pruebas unitarias
facilidad para incorporar nuevas funcionalidades
Tu tarea

No implementes nada.

Debes entregar un documento que contenga:

Diagnóstico de la arquitectura actual.
Problemas encontrados.
Riesgos del refactor.
Organización propuesta de los dominios.
Estructura final del proyecto.
Decisiones arquitectónicas justificadas.
Patrones de diseño que propones utilizar y por qué.
Qué principios de DDD aplicarías.
Plan de migración dividido en fases pequeñas.
Objetivos de cada fase.
Riesgos de cada fase.
Criterios de aceptación para considerar cada fase finalizada.

Si encuentras decisiones que consideras incorrectas o mejorables, no las implementes directamente.

Explícalas, justifícalas y propone una alternativa.

Ignora los siguientes archivos: README.md, ARCHITECTURE.md, AGENTS.md, NAMING_CONVENTIONS.md