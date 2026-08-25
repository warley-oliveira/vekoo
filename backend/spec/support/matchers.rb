# `not_change` para poder encadear várias contagens com `.and` — o oposto de
# `change` não existe pronto no rspec-expectations.
RSpec::Matchers.define_negated_matcher :not_change, :change
