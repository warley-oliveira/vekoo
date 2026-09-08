# libvips fora dos pacotes do sistema.
#
# Nesta máquina o libvips foi extraído em user-space (`dpkg -x`) em
# `VIPS_USERSPACE_ROOT`. O carregador dinâmico só lê `LD_LIBRARY_PATH` na
# largada do processo, então não adianta ajustar `ENV` depois: quando a
# variável falta, o processo se relança uma vez com ela — antes de qualquer
# `require "vips"`. Sem a variável de ambiente nada acontece (produção usa o
# libvips do sistema).
module VipsUserspace
  MARKER = "VIPS_USERSPACE_REEXEC"

  module_function

  def root
    from_env = ENV["VIPS_USERSPACE_ROOT"].to_s
    from_env.empty? ? root_from_dotenv : from_env
  end

  # O dotenv só entra depois do Bundler; aqui ainda é cedo demais para ele.
  def root_from_dotenv
    path = File.expand_path("../.env", __dir__)
    return nil unless File.exist?(path)

    line = File.foreach(path).find { |l| l.start_with?("VIPS_USERSPACE_ROOT=") }
    line&.split("=", 2)&.last&.strip&.delete('"')
  end

  def library_dir
    dir = root
    return nil if dir.nil? || dir.empty?

    Dir.glob(File.join(dir, "usr", "lib", "*", "libvips.so.*")).map { |f| File.dirname(f) }.first
  end

  def ensure!
    dir = library_dir
    return if dir.nil?

    current = ENV["LD_LIBRARY_PATH"].to_s.split(":")
    return if current.include?(dir)
    return if ENV[MARKER] # já relançou uma vez e mesmo assim não pegou: não insistir

    ENV["LD_LIBRARY_PATH"] = [ dir, *current ].join(":")
    ENV[MARKER] = "1"
    Kernel.exec(ENV, RbConfig.ruby, $PROGRAM_NAME, *ARGV)
  end
end
