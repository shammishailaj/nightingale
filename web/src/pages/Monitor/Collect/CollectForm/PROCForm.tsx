import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import _ from 'lodash';
import { Button, Form, Select, Input, TreeSelect } from 'antd';
import { FormProps } from 'antd/lib/form';
import { renderTreeNodes } from '@cpts/Layout/utils';
import { nameRule, interval } from '../config';

interface Props extends FormProps {
  params: any,
  initialValues: any,
  treeData: any[],
  onSubmit: (values: any) => Promise<any>,
}

const FormItem = Form.Item;
const { Option } = Select;
const formItemLayout = {
  labelCol: { span: 6 },
  wrapperCol: { span: 14 },
};
const defaultFormData = {
  collect_type: 'proc',
  collect_method: 'cmd',
  step: 10,
};

class CollectForm extends Component<Props> {
  state = {
    submitLoading: false,
  };

  getInitialValues() {
    const data = _.assignIn({}, defaultFormData, _.cloneDeep(this.props.initialValues));
    return data;
  }

  handleSubmit = (e: any) => {
    e.preventDefault();
    const { onSubmit } = this.props;
    this.props.form!.validateFields((errors, values) => {
      if (errors) {
        console.error(errors);
        return;
      }
      this.setState({
        submitLoading: true,
      });
      const { service } = values;
      values.tags = `service=${service}`;
      delete values.service;
      onSubmit(values).catch(() => {
        this.setState({
          submitLoading: false,
        });
      });
    });
  }

  render() {
    const { form } = this.props;
    const initialValues = this.getInitialValues();
    const { getFieldValue, getFieldDecorator, getFieldProps } = form!;
    const service = _.chain(initialValues.tags).split(',').filter(item => item.indexOf('service=') === 0).head().split('service=').last().value();
    getFieldProps('collect_type', {
      initialValue: initialValues.collect_type,
    });
    return (
      <div>
        <Form layout="horizontal" onSubmit={this.handleSubmit}>
          <FormItem
            {...formItemLayout}
            label="进程采集指标"
          >
            <span className="ant-form-text">proc.num</span>
          </FormItem>
          <FormItem
            {...formItemLayout}
            label="归属节点"
            required
          >
            {
              getFieldDecorator('nid', {
                initialValue: initialValues.nid,
                rules: [
                  { required: true, message: '不能为空' },
                ],
              })(
                <TreeSelect
                  style={{ width: 500 }}
                  showSearch
                  allowClear
                  treeDefaultExpandAll
                  treeNodeFilterProp="title"
                  treeNodeLabelProp="path"
                  dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                >
                  {renderTreeNodes(this.props.treeData)}
                </TreeSelect>,
              )
            }
          </FormItem>
          <FormItem {...formItemLayout} label="采集名称">
            <Input
              {...getFieldProps('name', {
                initialValue: initialValues.name,
                rules: [
                  {
                    required: true,
                    message: '不能为空',
                  },
                  nameRule,
                ],
              })}
              size="default"
              style={{ width: 500 }}
              placeholder="对采集配置的说明，例如 nginx进程采集"
            />
          </FormItem>
          <FormItem {...formItemLayout} label="service">
            <Input
              {...getFieldProps('service', {
                initialValue: service,
                rules: [
                  { required: true, message: '不能为空!' },
                  { pattern: /^[a-zA-Z0-9-]+$/, message: '只能允许填写英文、数字、中划线!' },
                ],
              })}
              size="default"
              style={{ width: 500 }}
              placeholder="全局唯一的进程英文名"
            />
          </FormItem>
          <FormItem {...formItemLayout} label="采集方式" required>
            <Select
              {...getFieldProps('collect_method', {
                initialValue: initialValues.collect_method,
                rules: [
                  { required: true, message: '不能为空' },
                ],
              })}
              size="default"
              style={{ width: 500 }}
            >
              <Select.Option value="cmd">命令行</Select.Option>
              <Select.Option value="name">进程名</Select.Option>
            </Select>
          </FormItem>
          <FormItem
            {...formItemLayout}
            label={
              getFieldValue('collect_method') === 'cmd' ? '命令行' : '进程名'
            }
            required
          >
            <Input
              {...getFieldProps('target', {
                initialValue: initialValues.target,
                rules: [
                  { required: true, message: '不能为空' },
                  { pattern: /^[^\u4e00-\u9fa5]+$/, message: '不能包含中文!' },
                ],
              })}
              size="default"
              style={{ width: 500 }}
            />
          </FormItem>
          <FormItem {...formItemLayout} label="采集周期">
            <Select
              size="default"
              style={{ width: 100 }}
              {...getFieldProps('step', {
                initialValue: initialValues.step,
                rules: [
                  { required: true, message: '不能为空' },
                ],
              })}
            >
              {
                _.map(interval, item => <Option key={item} value={item}>{item}</Option>)
              }
            </Select> 秒
          </FormItem>
          <FormItem {...formItemLayout} label="备注">
            <Input
              type="textarea"
              placeholder=""
              {...getFieldProps('comment', {
                initialValue: initialValues.comment,
              })}
              style={{ width: 500 }}
            />
          </FormItem>
          <FormItem wrapperCol={{ offset: 6 }} style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={this.state.submitLoading}>提交</Button>
            <Button
              style={{ marginLeft: 8 }}
            >
              <Link to={{ pathname: '/monitor/collect' }}>返回</Link>
            </Button>
          </FormItem>
        </Form>
      </div>
    );
  }
}

export default Form.create()(CollectForm);
