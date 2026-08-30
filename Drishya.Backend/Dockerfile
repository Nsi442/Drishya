# Multi-stage: the JDK and the Maven cache stay in the builder, and the image
# that actually ships carries a JRE and one jar.

# --- build ------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependencies first, as their own layer. pom.xml changes far less often than
# source does, so an ordinary code change reuses this layer instead of
# re-downloading Spring Boot, Hibernate and ONNX Runtime on every push — which
# on Render's free builder is the difference between a two-minute deploy and a
# six-minute one.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src

# A trained model, if one has been baked in. The directory is kept in the
# repository by models/.gitkeep so this COPY works on a fresh clone, where it
# holds nothing but that file — Docker's COPY fails outright on a missing path,
# and there is no conditional form.
COPY models ./models

RUN mvn -B -q clean package -DskipTests

# Tests are skipped here deliberately. They need a Docker daemon for
# Testcontainers, which is not available inside a build container on Render.
# They run locally and in CI, where there is one; a build that silently skipped
# them without saying so would be the problem, not skipping them here.

# --- run --------------------------------------------------------------------
# Noble, not Alpine. ONNX Runtime ships native libraries linked against glibc,
# and Alpine is musl — the JVM starts fine and then dies with
# "Error loading shared library libstdc++.so.6" the moment a model is loaded.
# The extra ~50 MB buys a runtime that actually works.
FROM eclipse-temurin:21-jre-noble AS runtime
WORKDIR /app

# Not root. Nothing in this application needs it.
RUN groupadd -r drishya && useradd -r -g drishya drishya

# For the container health check below.
RUN apt-get update && apt-get install -y --no-install-recommends curl     && rm -rf /var/lib/apt/lists/*

COPY --from=build /build/target/*.jar app.jar

# A trained model is optional and usually absent — the backend serves the
# heuristic when it is. Mounted or baked in at models/; see ml/README.md.
COPY --from=build /build/models ./models

RUN chown -R drishya:drishya /app
USER drishya

# Render's free instance is 512 MB. The heap has to leave room for metaspace,
# thread stacks, and ONNX Runtime's off-heap native allocation — a container
# killed for OOM reports nothing useful, it simply disappears mid-request.
ENV JAVA_TOOL_OPTIONS="-Xmx320m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC -XX:MaxRAMPercentage=70"

# Informational only. Render injects PORT and the app binds it.
EXPOSE 8080

# Container-aware health check. Render has its own probe pointed at the same
# path; this one makes `docker compose ps` locally tell the truth as well.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT:-8080}/actuator/health/readiness" || exit 1

ENTRYPOINT ["sh", "-c", "exec java -jar app.jar"]
