FactoryBot.define do
  factory :carousel do
    organization
    sequence(:title) { |n| "Carrossel #{n}" }
    format { "4:5" }
    favorite { false }
    edited_at { Time.current }
    theme do
      {
        "bg" => "oklch(0.97 0.005 90)",
        "surface" => "oklch(0.93 0.008 90)",
        "ink" => "oklch(0.2 0.01 285)",
        "accent" => "oklch(0.5 0.2 292)",
        "accentInk" => "oklch(0.98 0.005 292)"
      }
    end
    cards do
      [
        {
          "id" => "card-1",
          "layout" => "no-image",
          "bg" => nil,
          "align" => "top",
          "image" => nil,
          "blocks" => [
            {
              "id" => "card-1-b1",
              "type" => "text",
              "role" => "title",
              "spans" => [ { "text" => "Um título" } ],
              "align" => "start",
              "color" => "ink"
            }
          ]
        }
      ]
    end

    trait :trashed do
      trashed_at { 1.day.ago }
    end

    trait :favorite do
      favorite { true }
    end
  end
end
