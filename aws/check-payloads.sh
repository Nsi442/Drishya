#!/usr/bin/env bash
# Parses every script these deploy scripts send to the instance, WITHOUT
# sending anything.
#
#   bash aws/check-payloads.sh
#
# WHY THIS EXISTS. rescue.sh and build-on-instance.sh build their remote work
# as a double-quoted shell string and hand it to SSM. That string is written in
# two shells at once: an escaped dollar runs on the instance, a bare one is
# expanded here, while the payload is being built. Getting that wrong produces
# no local error at all — the script is well-formed here, and the fault appears
# minutes later, on the box, in output that names a line number in a file
# nobody can see.
#
# It has happened twice. "$JVM_OPTS" escaped expanded to nothing on the
# instance, so the container came up with no metaspace ceiling and the run
# reported success. "$(seq 1 30)" NOT escaped expanded to thirty
# newline-separated numbers, so 'for _ in ...' arrived as a syntax error.
#
# Both are visible the moment you look at the payload as the instance receives
# it, which is all this does: stub out the AWS calls, replace run_step with a
# dumper, and run bash -n over what would have been sent.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/out"

# Enough of the CLI to get past the stack lookups at the top of each script.
cat > "$WORK/bin/aws" <<'STUB'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in
  *InstanceId*)  echo i-0000000000000000; exit 0;;
  *SiteUrl*)     echo http://example.invalid; exit 0;;
  *SiteDnsName*) echo example.invalid; exit 0;;
  *InstanceType*) echo t3.small; exit 0;;
esac; done
echo ok
STUB
chmod +x "$WORK/bin/aws"

# build-on-instance.sh polls the site for five minutes after its last step.
# The payloads are all dumped long before that, and there is no site to poll,
# so make waiting free rather than waiting it out.
printf '#!/usr/bin/env bash\nexit 0\n'  > "$WORK/bin/sleep"
printf '#!/usr/bin/env bash\nexit 22\n' > "$WORK/bin/curl"
chmod +x "$WORK/bin/sleep" "$WORK/bin/curl"

cp aws/common.sh "$WORK/common.sh"

fail=0
for name in rescue.sh build-on-instance.sh; do
    python3 - "$WORK" "$name" <<'PY'
import sys, pathlib
work, name = sys.argv[1], sys.argv[2]
text = (pathlib.Path("aws") / name).read_text()
i = text.index("run_step() {")
j = text.index("\n}\n", i) + 3
dumper = (
    'run_step() {\n'
    '    N=$((${N:-0}+1)); export N\n'
    '    printf "%s" "$3" > "WORK/out/NAME.$N.sh"\n'
    '    printf "%s" "$1"  > "WORK/out/NAME.$N.label"\n'
    '}\n'
).replace("WORK", work).replace("NAME", name)
(pathlib.Path(work) / name).write_text(text[:i] + dumper + text[j:])
PY
    # The scripts do other things after their steps; the dump is all we want,
    # so a non-zero exit here is not a failure of the check.
    # Capped, because one of these scripts ends in a polling loop and the
    # dump is complete long before it gives up.
    PATH="$WORK/bin:$PATH" timeout 60 bash "$WORK/$name" >/dev/null 2>&1 || true

    for payload in "$WORK/out/$name".*.sh; do
        [ -e "$payload" ] || { echo "$name: no payloads dumped"; fail=1; break; }
        label=$(cat "${payload%.sh}.label")
        if out=$(bash -n "$payload" 2>&1); then
            printf '  ok    %s: %s\n' "$name" "$label"
        else
            printf '  FAIL  %s: %s\n' "$name" "$label"
            printf '%s\n' "$out" | sed 's/^/        /'
            # Numbered, because the error above names a line in this text and
            # in nothing else that exists on disk.
            nl -ba "$payload" | sed 's/^/        /'
            fail=1
        fi
    done
done

if [ "$fail" -ne 0 ]; then
    echo
    echo "A payload does not parse. It would have failed on the instance."
    exit 1
fi
echo
echo "Every payload parses."
