export const typeMap = {
  log: '日志',
  port: '端口',
  proc: '进程',
};
export const interval = [10, 30, 60, 120, 300, 600, 1800, 3600];
export const nameRule = {
  // eslint-disable-next-line no-useless-escape
  pattern: /^[\u4e00-\u9fa5a-zA-Z0-9\.\-\_]{0,128}$/,
  message: '名称只允许 英文数字 . - _',
};
