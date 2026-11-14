FactoryBot.define do
  # A pessoa: identidade e login.
  factory :user do
    name { "Marina Duarte" }
    sequence(:email) { |n| "pessoa-u#{n}@exemplo.com.br" }
    password { "carrossel123" }

    trait :master do
      master { true }
    end

    # Pessoa da Vekoo: entra na área /admin e nas organizações internas.
    trait :staff do
      staff { true }
    end
  end

  # O vínculo da pessoa com a organização. `name`, `email`, `password`, `phone` e `locale` são da
  # pessoa e montam o `User` junto; com `user:`, o vínculo é de uma pessoa que já existe (e eles
  # são ignorados).
  factory :account do
    organization
    role { "owner" }

    transient do
      name { "Marina Duarte" }
      sequence(:email) { |n| "pessoa#{n}@exemplo.com.br" }
      password { "carrossel123" }
      phone { nil }
      locale { nil }
      # `staff` é da pessoa (`User#staff`): `create(:account, :staff)` monta uma pessoa da Vekoo.
      staff { false }
    end

    user { association :user, name: name, email: email, password: password, phone: phone, locale: locale, staff: staff }

    trait :support do
      support { true }
      role { "member" }
      user { association :user, :master }
    end

    trait :staff do
      staff { true }
    end
  end
end
