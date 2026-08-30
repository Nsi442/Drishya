package com.drishya.backend.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI at {@code /swagger-ui.html}, OpenAPI document at
 * {@code /v3/api-docs}.
 *
 * <p>Neither path begins with {@code /api/}, so {@link AuthTokenFilter} lets
 * them through without a token — which is what makes the documentation usable
 * before you have signed in. The endpoints it describes are still protected;
 * only the description is public.
 *
 * <p>The bearer scheme is declared so the <b>Authorize</b> button appears and
 * a reader can actually exercise the API from the page. Without it, every
 * "try it out" returns 401 and the documentation looks broken rather than
 * secured.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI drishyaOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Drishya API")
                        .version("v1")
                        .description("""
                                Real-time transport visibility for vendors delivering into \
                                marketplace fulfilment centres.

                                **Two conventions worth knowing before reading anything else.**

                                Timestamps cross the wire as **epoch milliseconds**, never ISO \
                                strings — the browser does date arithmetic on them directly.

                                Every enum carries an explicit lower-case wire value \
                                (`at_gate`, `docs_pending`, `simulated`). Those strings are the \
                                contract with the frontend; the Java constant names are not.

                                **Tenant isolation.** Everything except `/metrics/**` is scoped \
                                to the calling account's tenant. A resource belonging to another \
                                tenant returns 404 rather than 403 — a 403 on a specific id \
                                would confirm that the id exists.

                                **Position provenance.** Every position records whether it came \
                                from the simulator or a real browser, and the two stay \
                                distinguishable in every response. Evidentiary weight differs, \
                                and the evidence pack is a chargeback dispute artefact.
                                """))
                .addSecurityItem(new SecurityRequirement().addList("bearer"))
                .components(new Components().addSecuritySchemes("bearer",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .description("""
                                        Obtain one from POST /api/auth/demo-login with \
                                        {"role":"vendor_admin"}, then paste it here.

                                        The token is HMAC-signed with a key regenerated on every \
                                        boot, so restarting the server invalidates it.""")));
    }
}
