# Infrastructure testing

Cheapest first: static checks, then plan-time assertions, then real environments.

## Terraform
- Static: `terraform fmt -check -recursive`, `terraform validate`, `tflint`, `checkov -d .` (or `trivy config .`).
- Policy on the plan: `terraform plan -out tf.plan && terraform show -json tf.plan > tfplan.json`, then `conftest test tfplan.json -p policy/`.
- `terraform test` (1.6+): `tests/*.tftest.hcl` with `run` blocks. `command = plan` asserts without creating anything; `command = apply` creates real resources, so use a sandbox account.
- Terratest (Go) for end-to-end: `terraform.InitAndApply`, always `defer terraform.Destroy`, unique name suffixes, tagged resources, a nightly sweeper for leaks.

## Kubernetes and Helm
- `kubeconform -strict -summary manifests/`, `helm lint chart/`, `helm template chart | kubeconform -strict -`, `kube-linter lint manifests/`.
- `kubectl apply --dry-run=server -f manifests/` against a real API server.
- Integration in CI on a throwaway cluster: `kind create cluster`, apply, `kubectl rollout status deploy/app --timeout=120s`, `kubectl wait --for=condition=ready pod -l app=app --timeout=120s`, then run smoke tests.

## Containers and config
- `hadolint Dockerfile`, then build and `container-structure-test test --image <img> --config cst.yaml`, then `trivy image <img>`.
- `ansible-lint` and Molecule for Ansible, `shellcheck` for scripts, `yamllint` for YAML.

## Resilience (staging only)
Kill a pod or instance, drain a node, break a dependency. Assert the service recovers, alerts fire and nothing pages for the wrong reason. Always with an abort switch and an owner on call.

## Safety and cost
Dedicated sandbox accounts, budgets and alerts, TTL tags, cleanup in `finally`/`defer`, never against production state, never with production credentials.
