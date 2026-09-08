ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.

# libvips em user-space (ver lib/vips_userspace.rb): relança o processo com
# LD_LIBRARY_PATH quando preciso, antes de qualquer gem carregar a biblioteca.
require_relative "../lib/vips_userspace"
VipsUserspace.ensure!
require "bootsnap/setup" # Speed up boot time by caching expensive operations.
