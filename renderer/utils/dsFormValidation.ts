export type DsFormValues = {
  name: string;
  type: 'oracle' | 'dameng';
  host: string;
  port: number;
  sid: string;
  serviceName: string;
  schema: string;
  username: string;
  password: string;
};

export type DsFormErrors = Partial<Record<keyof DsFormValues | 'oracleConn', string>>;

export function validateDsForm(form: DsFormValues): DsFormErrors {
  const errors: DsFormErrors = {};

  if (!form.name.trim()) errors.name = '请输入数据源名称';
  if (!form.host.trim()) errors.host = '请输入主机地址';
  if (!form.username.trim()) errors.username = '请输入用户名';
  if (!form.password.trim()) errors.password = '请输入密码';

  if (!form.port || form.port < 1 || form.port > 65535) {
    errors.port = '端口号需在 1-65535 之间';
  }

  if (form.type === 'oracle' && !form.sid.trim() && !form.serviceName.trim()) {
    errors.oracleConn = 'SID 与 Service Name 至少填写一项';
  }

  if (form.type === 'dameng' && !form.schema.trim()) {
    errors.schema = '请输入数据库名称';
  }

  return errors;
}

export function isDsFormValid(errors: DsFormErrors): boolean {
  return Object.keys(errors).length === 0;
}

export function mapDataSourceSaveError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const msg = raw.toLowerCase();
  if (msg.includes('unique constraint') || msg.includes('unique')) {
    return '该项目已存在数据源配置，请使用编辑功能修改';
  }
  if (
    msg.includes('connect') ||
    msg.includes('connection') ||
    msg.includes('ora-') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('refused')
  ) {
    return '数据库连接失败，请检查配置信息';
  }
  return '保存失败，请重试。如问题持续，请联系技术支持';
}
