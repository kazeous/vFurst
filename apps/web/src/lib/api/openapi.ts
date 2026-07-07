export function getOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "vFurst Public API",
      version: "1.0.0",
      description: "Read-only REST API for convention operations, authenticated with organization API keys."
    },
    servers: [
      {
        url: "/api/v1",
        description: "Current vFurst deployment"
      }
    ],
    security: [
      {
        bearerApiKey: []
      }
    ],
    paths: {
      "/events": listPath("Events", "List events", "read:events"),
      "/events/{eventId}": getPath("Events", "Get event", "read:events", "eventId"),
      "/registrations": listPath("Registrations", "List registrations", "read:registrations"),
      "/registrations/{registrationId}": getPath("Registrations", "Get registration", "read:registrations", "registrationId"),
      "/attendees": listPath("Attendees", "List attendees", "read:attendees"),
      "/vendors": listPath("Vendors", "List vendor applications", "read:vendors"),
      "/store": listPath("Store", "List store products", "read:store"),
      "/badges": listPath("Badges", "List badges", "read:badges"),
      "/openapi.json": {
        get: {
          tags: ["Reference"],
          summary: "Fetch this OpenAPI document",
          responses: okResponse("OpenAPI document returned")
        }
      }
    },
    components: {
      securitySchemes: {
        bearerApiKey: {
          type: "http",
          scheme: "bearer"
        }
      },
      parameters: {
        page: {
          name: "page",
          in: "query",
          schema: {
            type: "integer",
            minimum: 1
          }
        },
        pageSize: {
          name: "pageSize",
          in: "query",
          schema: {
            type: "integer",
            minimum: 1,
            maximum: 100
          }
        }
      }
    }
  };
}

function okResponse(description: string) {
  return {
    "200": {
      description
    },
    "401": {
      description: "Missing or invalid API key"
    },
    "403": {
      description: "API key scope does not allow this resource"
    },
    "429": {
      description: "Rate limit exceeded"
    }
  };
}

function listPath(tag: string, summary: string, scope: string) {
  return {
    get: {
      tags: [tag],
      summary,
      description: `Requires the \`${scope}\` scope. Supports pagination with \`page\` and \`pageSize\`.`,
      parameters: [
        {
          $ref: "#/components/parameters/page"
        },
        {
          $ref: "#/components/parameters/pageSize"
        }
      ],
      responses: okResponse(`${tag} returned`)
    }
  };
}

function getPath(tag: string, summary: string, scope: string, parameterName: string) {
  return {
    get: {
      tags: [tag],
      summary,
      description: `Requires the \`${scope}\` scope.`,
      parameters: [
        {
          name: parameterName,
          in: "path",
          required: true,
          schema: {
            type: "string",
            format: "uuid"
          }
        }
      ],
      responses: {
        ...okResponse(`${tag.slice(0, -1)} returned`),
        "404": {
          description: "Resource not found"
        }
      }
    }
  };
}
