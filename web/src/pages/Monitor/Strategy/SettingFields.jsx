/* eslint-disable react/no-access-state-in-setstate */
import React from 'react';
import PropTypes from 'prop-types';
import { Form, Button, Input, Radio, Tooltip, Icon, InputNumber, TreeSelect, Checkbox, Row, Col } from 'antd';
import _ from 'lodash';
import BaseComponent from '@path/BaseComponent';
import { normalizeTreeData, renderTreeNodes, filterTreeNodes } from '@path/Layout/utils';
import { services } from '@path/components/Graph';
import { Expressions, Filters, Actions, PeriodTime, AlarmUpgrade } from './SettingFields/';
import { prefixCls } from '../config';
import { processReqData } from './utils';

const FormItem = Form.Item;
const RadioGroup = Radio.Group;

class SettingFields extends BaseComponent {
  static contextTypes = {
    habitsId: PropTypes.string,
  };

  static propTypes = {
    initialValues: PropTypes.object,
  };

  static defaultProps = {
    initialValues: {},
  };

  constructor(props) {
    super(props);
    this.state = {
      metrics: [],
      tags: {},
      treeData: [],
      excludeTreeData: [],
      notifyDataLoading: false,
      notifyGroupData: [],
      notifyUserData: [],
      advanced: false,
    };
    this.fetchNotifyData = _.debounce(this.fetchNotifyData, 500);
  }

  componentDidMount() {
    this.fetchTreeData();
    this.fetchMetrics.call(this);
    this.fetchTagkvs(this.props.initialValues.strategy_expressions);
    this.fetchNotifyData();
  }

  fetchTreeData() {
    this.request({
      url: this.api.tree,
    }).then((res) => {
      this.setState({ treeData: res });
      const treeData = normalizeTreeData(res);
      this.setState({ treeData, originTreeData: res }, () => {
        if (this.props.initialValues.nid) {
          this.handleNsChange(this.props.initialValues.nid);
        }
      });
    });
  }

  async fetchMetrics() {
    const { nid } = this.props.initialValues;
    let hosts = [];
    let metrics = [];
    try {
      hosts = await services.fetchEndPoints(nid, this.context.habitsId);
    } catch (e) {
      console.log(e);
    }
    try {
      metrics = await this.request({
        url: `${this.api.graphIndex}/metrics`,
        type: 'POST',
        data: JSON.stringify({ endpoints: hosts }),
      }).then((res) => {
        return res.metrics;
      });
    } catch (e) {
      console.log(e);
    }
    this.setState({ metrics });
  }

  fetchTagkvs(strategyExpressionsValue) {
    if (!strategyExpressionsValue) return;
    // 历史原因只取第一个 expression.metric
    const firstExpression = strategyExpressionsValue[0] || {};
    const { metric = '' } = firstExpression;
    const { nid } = this.props.initialValues;

    if (nid && metric && this.currentMetric !== metric) {
      this.request({
        url: `${this.api.graphIndex}/tagkv`,
        type: 'POST',
        data: JSON.stringify({
          nid: [nid],
          metric: [metric],
        }),
      }).then((data) => {
        const tagkvsraw = _.sortBy(data.length > 0 ? data[0].tagkv : [], 'tagk');
        const tagkvs = {};

        _.each(tagkvsraw, (v) => {
          if (v && v.tagk && v.tagv) {
            tagkvs[v.tagk] = _.sortBy(v.tagv);
          }
        });
        this.currentMetric = metric;
        this.setState({
          tags: tagkvs,
        });
      });
    }
  }

  async fetchNotifyData(params = {}, params2 = {}) {
    this.setState({ notifyDataLoading: true });
    try {
      const teamData = await this.request({
        url: this.api.team,
        data: {
          ...params,
        },
      });
      const userData = await this.request({
        url: this.api.user,
        data: {
          limit: 1000,
          ...params2,
        },
      });
      this.setState({
        notifyGroupData: teamData.list,
        notifyUserData: userData.list,
      });
    } catch (e) {
      console.log(e);
    }
    this.setState({ notifyDataLoading: false });
  }

  handleSubmit = (e) => {
    e.preventDefault();
    this.props.form.validateFields((errors, values) => {
      if (errors) {
        console.log('Errors in form!!!', errors);
        return;
      }
      this.props.onSubmit(processReqData(values));
    });
  }

  handleExpressionsChange = (val) => {
    this.fetchTagkvs(val);
  }

  handleNsChange = (value) => {
    const excludeTreeData = filterTreeNodes(this.state.treeData, value);
    const treeDataChildren = _.filter(this.state.originTreeData, (item) => {
      return item.pid === value && item.leaf === 1;
    });
    this.setState({ treeDataChildren, excludeTreeData });
  }

  render() {
    const { getFieldDecorator, getFieldValue, setFieldsValue } = this.props.form;
    const formItemLayout = {
      labelCol: { span: 4 },
      wrapperCol: { span: 16 },
    };

    getFieldDecorator('category', {
      initialValue: 1,
    });

    return (
      <Form className={`${prefixCls}-strategy-form`} layout="horizontal" onSubmit={this.handleSubmit}>
        <FormItem
          {...formItemLayout}
          label="策略名称："
        >
          {
            getFieldDecorator('name', {
              initialValue: this.props.initialValues.name,
              rules: [{
                required: true, message: '请输入策略名称!',
              }],
            })(
              <Input />,
            )
          }
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="生效节点："
        >
          {
            getFieldDecorator('nid', {
              initialValue: this.props.initialValues.nid,
              onChange: (value) => {
                this.handleNsChange(value);
                setFieldsValue({
                  exclude_nid: [],
                });
              },
            })(
              <TreeSelect
                showSearch
                allowClear
                treeDefaultExpandAll
                treeNodeFilterProp="title"
                treeNodeLabelProp="path"
                dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
              >
                {renderTreeNodes(this.state.treeData)}
              </TreeSelect>,
            )
          }
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="排除节点："
        >
          {
            getFieldDecorator('excl_nid', {
              initialValue: this.props.initialValues.excl_nid,
            })(
              <TreeSelect
                multiple
                showSearch
                allowClear
                treeDefaultExpandAll
                treeNodeFilterProp="title"
                treeNodeLabelProp="path"
                dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
              >
                {renderTreeNodes(this.state.excludeTreeData)}
              </TreeSelect>,
            )
          }
        </FormItem>
        <FormItem
          {...formItemLayout}
          label={
            <Tooltip title={
              <div>
                一级报警：发送语音, 短信, IM, 邮件<br />
                二级报警：发送短信, IM, 邮件<br />
                三级报警：发送IM，邮件
              </div>
            }>
              <span>报警级别 <Icon type="info-circle-o" /></span>
            </Tooltip>
          }
          required
        >
          {
            getFieldDecorator('priority', {
              initialValue: this.props.initialValues.priority || 3,
            })(
              <RadioGroup size="default">
                {
                  _.map({
                    1: {
                      alias: '一级报警',
                      color: 'red',
                    },
                    2: {
                      alias: '二级报警',
                      color: 'yellow',
                    },
                    3: {
                      alias: '三级报警',
                      color: 'blue',
                    },
                  }, (val, key) => {
                    return <Radio key={key} value={Number(key)}>{val.alias}</Radio>;
                  })
                }
              </RadioGroup>,
            )
          }
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="统计周期："
        >
          {
            getFieldDecorator('alert_dur', {
              initialValue: this.props.initialValues.alert_dur !== undefined ? this.props.initialValues.alert_dur : 180,
            })(
              <InputNumber min={0} />,
            )
          }
          秒
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="触发条件："
          validateStatus="success" // 兼容
          help="" // 兼容
        >
          {
            getFieldDecorator('exprs', {
              initialValue: this.props.initialValues.exprs || [Expressions.defaultExpressionValue],
              onChange: this.handleExpressionsChange,
              rules: [{
                validator: Expressions.checkExpressions,
              }],
            })(
              <Expressions
                alertDuration={getFieldValue('alert_dur')}
                headerExtra={<div>headerExtra</div>}
                metrics={this.state.metrics}
              />,
            )
          }
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="Tag 过滤："
        >
          {
            getFieldDecorator('tags', {
              initialValue: this.props.initialValues.tags || [],
            })(
              <Filters
                tags={this.state.tags}
              />,
            )
          }
        </FormItem>
        <FormItem
          {...formItemLayout}
          label="执行动作："
          validateStatus="success" // 兼容
          help="" // 兼容
        >
          {
            getFieldDecorator('action', {
              initialValue: this.props.initialValues.action || Actions.defaultValue,
              rules: [{
                validator: Actions.checkActions,
              }],
            })(
              <Actions
                loading={this.state.notifyDataLoading}
                notifyGroupData={this.state.notifyGroupData}
                notifyUserData={this.state.notifyUserData}
                // eslint-disable-next-line react/jsx-no-bind
                fetchNotifyData={this.fetchNotifyData.bind(this)}
              />,
            )
          }
        </FormItem>
        <Row style={{ marginBottom: 10 }}>
          <Col offset={4}>
            <a
              onClick={() => {
                this.setState({ advanced: !this.state.advanced });
              }}
            >高级 <Icon type={this.state.advanced ? 'up' : 'down'} />
            </a>
          </Col>
        </Row>
        <div style={{ display: this.state.advanced ? 'block' : 'none' }}>
          <FormItem
            {...formItemLayout}
            label="留观时长："
          >
            {
              getFieldDecorator('recovery_dur', {
                initialValue: this.props.initialValues.recovery_dur !== undefined ? this.props.initialValues.recovery_dur : 0,
              })(
                <InputNumber min={0} />,
              )
            }
            秒（告警恢复后持续观察{getFieldValue('recovery_dur')}秒，未再触发阈值才发送恢复通知）
          </FormItem>
          <FormItem
            {...formItemLayout}
            label="静默恢复："
          >
            {
              getFieldDecorator('recovery_notify', {
                initialValue: this.props.initialValues.recovery_notify === undefined ? false : !this.props.initialValues.recovery_notify,
                valuePropName: 'checked',
              })(
                <Checkbox>
                  不发送恢复通知
                </Checkbox>,
              )
            }
          </FormItem>
          <FormItem
            {...formItemLayout}
            label="生效时间："
          >
            {
              getFieldDecorator('period_time', {
                initialValue: this.props.initialValues.period_time || PeriodTime.defaultValue,
              })(
                <PeriodTime />,
              )
            }
          </FormItem>
          <FormItem
            {...formItemLayout}
            label="报警升级："
            validateStatus="success" // 兼容
            help="" // 兼容
          >
            {
              getFieldDecorator('alert_upgrade', {
                initialValue: this.props.initialValues.alert_upgrade || AlarmUpgrade.defaultValue,
                rules: [{
                  validator: AlarmUpgrade.checkAlarmUpgrade,
                }],
              })(
                <AlarmUpgrade
                  loading={this.state.notifyDataLoading}
                  notifyGroupData={this.state.notifyGroupData}
                  notifyUserData={this.state.notifyUserData}
                  // eslint-disable-next-line react/jsx-no-bind
                  fetchNotifyData={this.fetchNotifyData.bind(this)}
                />,
              )
            }
          </FormItem>
        </div>
        <FormItem wrapperCol={{ span: 16, offset: 4 }} style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit">确定</Button>
        </FormItem>
      </Form>
    );
  }
}

export default Form.create()(SettingFields);
