/**
 * THIS MODULE IS VERY INCOMPLETE, ANY CODE RELYING ON IT WILL NOT WORK IN FUTURE VERSIONS
 * Common types: conf-parser.c DEFINE_PARSER
 * https://github.com/systemd/systemd/blob/main/src/shared/conf-parser.c
 * https://github.com/systemd/systemd/blob/main/src/basic/parse-util.c
 */

import type { Parser } from "./parser.js";

export const trimWhitespaceStart = /^[ \t\n\r]+/;

/**
 * Returning undefined means an invalid value.
 * This is really incomplete but it'd take too long to
 * trace all these down in the source.
 * I accept contributions!
 */
class ValueParser {
  parser: Parser;
  /** possible future cursor context */ type: string;

  constructor(parser: Parser) {
    this.parser = parser;
    this.type = "OTHER";

    return new Proxy(this, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);

        if (typeof value === "function") {
          return (...args: any[]) => {
            target.type = "OTHER";
            return value.apply(target, args);
          };
        }

        return value;
      },
    });
  }

  warn_compat(warning: "DISABLED_CONFIGURATION" | "DISABLED_LEGACY" | "DISABLED_EXPERIMENTAL") {
    this.type = "NOTSUPPORTED";

    const offset = this.parser.warningOffset;
    this.parser.warningOffset = 0;
    if (warning === "DISABLED_CONFIGURATION")
      this.parser.warn("Support for this option has been disabled by the parser and it is ignored", "error");
    else if (warning === "DISABLED_LEGACY")
      this.parser.warn("Support for this option has been removed and it is ignored", "error");
    else if (warning === "DISABLED_EXPERIMENTAL")
      this.parser.warn("Support for this option has not yet been enabled and it is ignored", "error");
    this.parser.warningOffset = offset;

    return undefined;
  }

  #integer(value: string, min: bigint, max: bigint): bigint | undefined {
    value = value.replace(trimWhitespaceStart, "");
    let base = 0;

    // https://locutus.io/c/stdlib/strtol/
    const normalizeBase = (base: number, value: string, index: number): number => {
      if (base === 0) {
        const prefix = value.slice(index, index + 2);
        if (prefix === "0x" || prefix === "0X") return 16;
        if (value[index] === "0") {
          this.parser.warn("Integer starting with 0 is interpreted as octal. Consider using 0o for clarity", "info");
          return 8;
        }

        // mangle_base()
        if (prefix === "0b" || prefix === "0B") return 2;
        if (prefix === "0o" || prefix === "0O") return 8;

        return 10;
      }

      return base;
    };

    const charToDigit = (char: string): number => {
      if (char >= "0" && char <= "9") {
        return char.charCodeAt(0) - 48;
      }

      const lower = char.toLowerCase();
      if (lower >= "a" && lower <= "z") {
        return lower.charCodeAt(0) - 87;
      }

      return -1;
    };

    let index = 0;

    while (index < value.length && /\s/.test(value[index] ?? "")) {
      index += 1;
    }

    let sign = 1n;
    if (value[index] === "+" || value[index] === "-") {
      if (value[index] === "-") {
        sign = -1n;
      }
      index += 1;
    }

    const normalizedBase = normalizeBase(base, value, index);

    const prefix = value.slice(index, index + 2);
    if (
      (normalizedBase === 16 && (prefix === "0x" || prefix === "0X")) ||
      (normalizedBase === 2 && (prefix === "0b" || prefix === "0B")) ||
      (normalizedBase === 8 && (prefix === "0o" || prefix === "0O"))
    ) {
      index += 2;
    }

    let val = 0n;
    let digits = 0;

    while (index < value.length) {
      const digit = charToDigit(value[index] ?? "");
      if (digit < 0 || digit >= normalizedBase) {
        break;
      }
      val = val * BigInt(normalizedBase) + BigInt(digit);
      digits += 1;
      index += 1;
    }

    if (digits === 0) {
      this.parser.warn("Invalid integer value. Examples of valid values are 10, 0o12, 0xa and 0b1010", "error");
      return undefined;
    }

    const result = sign * val;

    if (result < min || result > max) {
      this.parser.warn(`Integer value out of range (${min} to ${max})`);
      return undefined;
    }

    return result;
  }

  int(value: string) {
    this.type = "INTEGER";
    const result = this.#integer(value, -2147483648n, 2147483647n);
    return result === undefined ? undefined : Number(result);
  }

  unsigned(value: string) {
    this.type = "UNSIGNED";
    const result = this.#integer(value, 0n, 4294967295n);
    return result === undefined ? undefined : Number(result);
  }

  iec_size(value: string) {
    this.type = "SIZE";
    return value;
  }

  iec_uint64(value: string) {
    this.type = "SIZE";
    return value;
  }

  si_uint64(value: string) {
    this.type = "SIZE";
    return value;
  }

  bool(value: string): boolean | undefined {
    this.type = "BOOLEAN";

    const lowercaseValue = value.toLowerCase();
    if (["1", "yes", "y", "true", "t", "on"].includes(lowercaseValue)) return true;
    if (["0", "no", "n", "false", "f", "off"].includes(lowercaseValue)) return false;

    this.parser.warn("Boolean value invalid. Valid examples are true and false", "error");
    return undefined;
  }

  string(value: string) {
    this.type = "STRING";
    // This is basically all it does
    return value;
  }

  path(value: string) {
    this.type = "PATH";
    return value;
  }

  unit_path_printf(value: string) {
    this.type = "PATH";
    return value;
  }

  colon_separated_paths(value: string) {
    this.type = "PATH";
    return value;
  }

  strv(value: string) {
    this.type = "STRING [...]";
    return value;
  }

  exec_nice(value: string) {
    this.type = "NICE";
    return value;
  }

  exec_oom_score_adjust(value: string) {
    this.type = "OOMSCOREADJUST";
    return value;
  }

  exec_io_class(value: string) {
    this.type = "IOCLASS";
    return value;
  }

  exec_io_priority(value: string) {
    this.type = "IOPRIORITY";
    return value;
  }

  exec_cpu_sched_policy(value: string) {
    this.type = "CPUSCHEDPOLICY";
    return value;
  }

  exec_cpu_sched_prio(value: string) {
    this.type = "CPUSCHEDPRIO";
    return value;
  }

  exec_cpu_affinity(value: string) {
    this.type = "CPUAFFINITY";
    return value;
  }

  mode(value: string) {
    this.type = "MODE";
    return value;
  }

  unit_env_file(value: string) {
    this.type = "FILE";
    return value;
  }

  exec_output(value: string) {
    this.type = "OUTPUT";
    return value;
  }

  exec_input(value: string) {
    this.type = "INPUT";
    return value;
  }

  log_facility(value: string) {
    this.type = "FACILITY";
    return value;
  }

  log_level(value: string) {
    this.type = "LEVEL";
    return value;
  }

  exec_secure_bits(value: string) {
    this.type = "SECUREBITS";
    return value;
  }

  capability_set(value: string) {
    this.type = "BOUNDINGSET";
    return value;
  }

  rlimit(value: string) {
    this.type = "LIMIT";
    return value;
  }

  unit_deps(value: string) {
    this.type = "UNIT [...]";
    return value;
  }

  exec(value: string) {
    this.type = "PATH [ARGUMENT [...]]";
    return value;
  }

  service_type(value: string) {
    this.type = "SERVICETYPE";
    return value;
  }

  service_exit_type(value: string) {
    this.type = "SERVICEEXITTYPE";
    return value;
  }

  service_restart(value: string) {
    this.type = "SERVICERESTART";
    return value;
  }

  service_restart_mode(value: string) {
    this.type = "SERVICERESTARTMODE";
    return value;
  }

  service_timeout_failure_mode(value: string) {
    this.type = "TIMEOUTMODE";
    return value;
  }

  kill_mode(value: string) {
    this.type = "KILLMODE";
    return value;
  }

  signal(value: string) {
    this.type = "SIGNAL";
    return value;
  }

  socket_listen(value: string) {
    this.type = "SOCKET [...]";
    return value;
  }

  socket_bind(value: string) {
    this.type = "SOCKETBIND";
    return value;
  }

  socket_bindtodevice(value: string) {
    this.type = "NETWORKINTERFACE";
    return value;
  }

  sec(value: string) {
    this.type = "SECONDS";
    return value;
  }

  nsec(value: string) {
    this.type = "NANOSECONDS";
    return value;
  }

  namespace_path_strv(value: string) {
    this.type = "PATH [...]";
    return value;
  }

  bind_paths(value: string) {
    this.type = "PATH[:PATH[:OPTIONS]] [...]";
    return value;
  }

  unit_mounts_for(value: string) {
    this.type = "PATH [...]";
    return value;
  }

  exec_mount_propagation_flag(value: string) {
    this.type = "MOUNTFLAG";
    return value;
  }

  unit_string_printf(value: string) {
    this.type = "STRING";
    return value;
  }

  trigger_unit(value: string) {
    this.type = "UNIT";
    return value;
  }

  timer(value: string) {
    this.type = "TIMER";
    return value;
  }

  path_spec(value: string) {
    this.type = "PATH";
    return value;
  }

  notify_access(value: string) {
    this.type = "ACCESS";
    return value;
  }

  ip_tos(value: string) {
    this.type = "TOS";
    return value;
  }

  unit_condition_path(value: string) {
    this.type = "CONDITION";
    return value;
  }

  unit_condition_string(value: string) {
    this.type = "CONDITION";
    return value;
  }

  unit_slice(value: string) {
    this.type = "SLICE";
    return value;
  }

  documentation(value: string) {
    this.type = "URL";
    return value;
  }

  service_timeout(value: string) {
    this.type = "SECONDS";
    return value;
  }

  emergency_action(value: string) {
    this.type = "ACTION";
    return value;
  }

  set_status(value: string) {
    this.type = "STATUS";
    return value;
  }

  service_sockets(value: string) {
    this.type = "SOCKETS";
    return value;
  }

  environ(value: string) {
    this.type = "ENVIRON";
    return value;
  }

  syscall_filter(value: string) {
    this.type = "SYSCALLS";
    return value;
  }

  syscall_archs(value: string) {
    this.type = "ARCHS";
    return value;
  }

  syscall_errno(value: string) {
    this.type = "ERRNO";
    return value;
  }

  syscall_log(value: string) {
    this.type = "SYSCALLS";
    return value;
  }

  address_families(value: string) {
    this.type = "FAMILIES";
    return value;
  }

  namespace_flags(value: string) {
    this.type = "NAMESPACES";
    return value;
  }

  restrict_filesystems(value: string) {
    this.type = "FILESYSTEMS";
    return value;
  }

  cg_weight(value: string) {
    this.type = "WEIGHT";
    return value;
  }

  cg_cpu_weight(value: string) {
    this.type = "CPUWEIGHT";
    return value;
  }

  memory_limit(value: string) {
    this.type = "LIMIT";
    return value;
  }

  device_allow(value: string) {
    this.type = "DEVICE";
    return value;
  }

  device_policy(value: string) {
    this.type = "POLICY";
    return value;
  }

  io_limit(value: string) {
    this.type = "LIMIT";
    return value;
  }

  io_device_weight(value: string) {
    this.type = "DEVICEWEIGHT";
    return value;
  }

  io_device_latency(value: string) {
    this.type = "DEVICELATENCY";
    return value;
  }

  long(value: string) {
    this.type = "LONG";
    return value;
  }

  socket_service(value: string) {
    this.type = "SERVICE";
    return value;
  }

  exec_selinux_context(value: string) {
    this.type = "LABEL";
    return value;
  }

  job_mode(value: string) {
    this.type = "MODE";
    return value;
  }

  job_mode_isolate(value: string) {
    this.type = "BOOLEAN";
    return value;
  }

  personality(value: string) {
    this.type = "PERSONALITY";
    return value;
  }

  log_filter_patterns(value: string) {
    this.type = "REGEX";
    return value;
  }

  mount_node(value: string) {
    this.type = "NODE";
    return value;
  }

  bpf_delegate_commands(value: string) {
    this.type = "BPF_DELEGATE_COMMANDS";
    return value;
  }

  bpf_delegate_maps(value: string) {
    this.type = "BPF_DELEGATE_MAPS";
    return value;
  }

  bpf_delegate_programs(value: string) {
    this.type = "BPF_DELEGATE_PROGRAMS";
    return value;
  }

  bpf_delegate_attachments(value: string) {
    this.type = "BPF_DELEGATE_ATTACHMENTS";
    return value;
  }

  working_directory(value: string) {
    return value;
  }
  root_image_options(value: string) {
    return value;
  }
  image_policy(value: string) {
    return value;
  }
  exec_root_hash(value: string) {
    return value;
  }
  exec_root_hash_sig(value: string) {
    return value;
  }
  extension_images(value: string) {
    return value;
  }
  mount_images(value: string) {
    return value;
  }
  user_group_compat(value: string) {
    return value;
  }
  user_group_strv_compat(value: string) {
    return value;
  }
  tristate(value: string): boolean | null | undefined {
    if (value.length === 0) return null;
    const lowercaseValue = value.toLowerCase();
    if (["1", "yes", "y", "true", "t", "on"].includes(lowercaseValue)) return true;
    if (["0", "no", "n", "false", "f", "off"].includes(lowercaseValue)) return false;
    this.parser.warn("Tristate value invalid. Examples of valid values are true, false and an empty field", "error");
    return undefined;
  }
  exec_coredump_filter(value: string) {
    return value;
  }
  numa_policy(value: string) {
    return value;
  }
  numa_mask(value: string) {
    return value;
  }
  pass_environ(value: string) {
    return value;
  }
  unset_environ(value: string) {
    return value;
  }
  exec_input_text(value: string) {
    return value;
  }
  exec_input_data(value: string) {
    return value;
  }
  tty_size(value: string) {
    return value;
  }
  log_extra_fields(value: string) {
    return value;
  }
  exec_keyring_mode(value: string) {
    return value;
  }
  protect_proc(value: string) {
    return value;
  }
  proc_subset(value: string) {
    return value;
  }
  private_bpf(value: string) {
    return value;
  }
  temporary_filesystems(value: string) {
    return value;
  }
  private_tmp(value: string) {
    return value;
  }
  protect_control_groups(value: string) {
    return value;
  }
  log_namespace(value: string) {
    return value;
  }
  private_users(value: string) {
    return value;
  }
  private_pids(value: string) {
    return value;
  }
  protect_system(value: string) {
    return value;
  }
  protect_home(value: string) {
    return value;
  }
  exec_preserve_mode(value: string) {
    return value;
  }
  exec_directories(value: string) {
    return value;
  }
  exec_quota(value: string) {
    return value;
  }
  set_credential(value: string) {
    return value;
  }
  load_credential(value: string) {
    return value;
  }
  import_credential(value: string) {
    return value;
  }
  exec_utmp_mode(value: string) {
    return value;
  }
  exec_apparmor_profile(value: string) {
    return value;
  }
  exec_smack_process_label(value: string) {
    return value;
  }
  protect_hostname(value: string) {
    return value;
  }
  exec_memory_thp(value: string) {
    return value;
  }
  unit_cpu_set(value: string) {
    return value;
  }
  cpuset_partition(value: string) {
    return value;
  }
  cpu_quota(value: string) {
    return value;
  }
  sec_def_infinity(value: string) {
    return value;
  }
  tasks_max(value: string) {
    return value;
  }
  delegate(value: string) {
    return value;
  }
  delegate_subgroup(value: string) {
    return value;
  }
  disable_controllers(value: string) {
    return value;
  }
  in_addr_prefixes(value: string) {
    return value;
  }
  ip_filter_bpf_progs(value: string) {
    return value;
  }
  managed_oom_mode(value: string) {
    return value;
  }
  managed_oom_mem_pressure_limit(value: string) {
    return value;
  }
  managed_oom_mem_pressure_duration_sec(value: string) {
    return value;
  }
  managed_oom_preference(value: string) {
    return value;
  }
  managed_oom_rules(value: string) {
    return value;
  }
  bpf_foreign_program(value: string) {
    return value;
  }
  cgroup_socket_bind(value: string) {
    return value;
  }
  restrict_network_interfaces(value: string) {
    return value;
  }
  pressure_watch(value: string) {
    return value;
  }
  cgroup_nft_set(value: string) {
    return value;
  }
  bind_network_interface(value: string) {
    return value;
  }
  obsolete_unit_deps(value: string) {
    return value;
  }
  job_timeout_sec(value: string) {
    return value;
  }
  job_running_timeout_sec(value: string) {
    return value;
  }
  reboot_parameter(value: string) {
    return value;
  }
  exit_status(value: string) {
    return value;
  }
  collect_mode(value: string) {
    return value;
  }
  pid_file(value: string) {
    return value;
  }
  sec_fix_0(value: string) {
    return value;
  }
  service_timeout_abort(value: string) {
    return value;
  }
  bus_name(value: string) {
    return value;
  }
  luo_sessions(value: string) {
    return value;
  }
  oom_policy(value: string) {
    return value;
  }
  open_file(value: string) {
    return value;
  }
  service_refresh_on_reload(value: string) {
    return value;
  }
  socket_protocol(value: string) {
    return value;
  }
  socket_timestamping(value: string) {
    return value;
  }
  iec_size_long(value: string) {
    return value;
  }
  unit_path_strv_printf(value: string) {
    return value;
  }
  fdname(value: string) {
    return value;
  }
  socket_defer_trigger(value: string) {
    return value;
  }
  xattr(value: string) {
    return value;
  }
  swap_priority(value: string) {
    return value;
  }
  concurrency_max(value: string) {
    return value;
  }
}

export { ValueParser };
