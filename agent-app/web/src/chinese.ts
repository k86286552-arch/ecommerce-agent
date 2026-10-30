/** Presentation-only labels. API identifiers and saved work remain unchanged. */
export const platformNames:Record<string,string>={taobao:'淘宝',amazon:'亚马逊',douyin:'抖音',tiktok:'海外短视频平台',xiaohongshu:'小红书'};
export const backendNames:Record<string,string>={mock:'本地测试',api:'远程接口',vllm:'本地推理服务',disabled:'未启用',transformers:'本地模型'};
export const scoreNames:Record<string,string>={accuracy:'准确性',attractiveness:'吸引力',compliance:'合规性',seo:'搜索优化'};

const fieldNames:Record<string,string>={
  title:'商品标题',category:'品类',platform:'目标平台',tone:'内容语气',attributes:'商品属性',selling_points:'商品卖点',
  target_audience:'目标人群',price_positioning:'价格定位',constraints:'合规约束',original_description:'原始描述',
  custom_image_prompt:'图片提示词',custom_video_prompt:'视频提示词',text:'文案模型',image:'图片模型',video:'视频模型',
  backend:'服务方式',model:'模型编号',api_url:'接口地址',query_url:'查询地址',api_key:'接口密钥',kind:'生成类型',prompt:'提示词',
  MODEL_BACKEND:'文案模型服务方式',MODEL_PATH:'本地模型目录',LORA_PATH:'微调模型目录',IMAGE_BACKEND:'图片模型服务方式',
  VIDEO_BACKEND:'视频模型服务方式',VIDEO_DURATION:'视频时长',VIDEO_POLL_INTERVAL:'视频查询间隔',VIDEO_MAX_WAIT:'视频等待时长',
  SEEDREAM_API_URL:'图片接口地址',SEEDREAM_API_KEY:'图片接口密钥',SEEDREAM_MODEL:'图片模型编号',
  SEEDANCE_CREATE_URL:'视频创建地址',SEEDANCE_QUERY_URL:'视频查询地址',SEEDANCE_API_KEY:'视频接口密钥',SEEDANCE_MODEL:'视频模型编号',
};
const errors:Record<string,string>={
  'Image backend is disabled':'图片生成功能尚未启用，请在模型设置中选择服务方式。',
  'Video backend is disabled':'视频生成功能尚未启用，请在模型设置中选择服务方式。',
  'Unsupported text backend':'请选择有效的文案模型服务方式。',
  'Unsupported media backend':'请选择有效的图片或视频模型服务方式。',
  'Transformers text backend is managed by environment':'本地文案模型由环境配置管理，请在配置文件中修改。',
  'Unable to save model settings':'模型设置保存失败，请检查本机存储权限与剩余空间。',
  'Task not found':'未找到该任务，请刷新历史作品列表。',
  'Original work not found':'未找到原作品，请刷新历史作品列表。',
  'Original work is unavailable':'原作品暂时无法读取，请从历史作品中重新打开。',
  'Work not found':'未找到该作品。',
  'No saved content is available to regenerate':'该任务尚无可重新生成的内容，请先完成一次生成。',
  'Work has no completed assets':'该作品尚无可以下载的素材。',
  'Media kind not found':'不支持此素材类型。','Media file not found':'素材文件不存在或已移动。',
  'Example asset not found':'示例素材不存在或已移动。',
  'Video unavailable':'视频暂时无法生成，请检查视频模型设置后重试。',
  'Not Found':'未找到所需内容，请刷新页面后重试。',
};

export function chineseError(error:unknown,status=0):string{
  if(Array.isArray(error))return error.map(issue=>{
    const path=Array.isArray(issue.loc)?issue.loc.filter((key:string)=>key!=='body'):[];
    const field=path.map((key:string)=>fieldNames[key]||'输入内容').join(' / ')||'输入内容';
    const reason=issue.type==='missing'||issue.type==='string_too_short'?'不能为空':issue.type==='string_too_long'?'内容过长':'格式或取值不正确';
    return `${field}${reason}。`;
  }).join(' ');
  const text=error instanceof Error?error.message:typeof error==='string'?error:'';
  if(!text)return '操作失败，请稍后重试。';
  if(errors[text])return errors[text];
  const field=Object.keys(fieldNames).find(key=>text.startsWith(`${key} `));
  if(field){
    if(text.includes('is required'))return `请填写${fieldNames[field]}。`;
    if(text.includes('existing directory'))return `${fieldNames[field]}不存在，请检查目录配置。`;
    if(text.includes('integer')||text.includes('greater than zero'))return `${fieldNames[field]}必须为正整数。`;
    if(field==='VIDEO_DURATION')return '视频时长必须为 5 秒或 10 秒。';
    return `${fieldNames[field]}配置不正确，请检查模型设置。`;
  }
  if(text.includes('MEDIA_OUTPUT_DIR'))return '素材保存目录无法写入，请检查目录权限。';
  if(status===401||/\b401\b|unauthorized|invalid.*(?:key|credential)|authentication/i.test(text))return '接口认证失败，请检查模型设置中的接口密钥。';
  if(status===403||/\b403\b|forbidden|permission denied/i.test(text))return '当前账户没有访问权限，请检查模型权限和接口密钥。';
  if(status===429||/\b429\b|rate.?limit|quota/i.test(text))return '接口请求过于频繁或额度不足，请稍后重试并检查账户额度。';
  if(status===402||/insufficient.*(?:balance|credit)|\b402\b/i.test(text))return '模型服务账户余额不足，请检查账户余额。';
  if(/timed?\s*out|timeout/i.test(text))return '请求超时，请稍后重试；已提交的任务可从历史作品中继续查看。';
  if(/connect|network|failed to fetch|offline/i.test(text))return '无法连接模型服务，请检查服务地址和网络连接。';
  // Keep Chinese diagnostics while excluding raw provider responses and code names.
  const summary=text.split(/[:：]/)[0].replace(/JSON/g,'数据格式').replace(/URL/g,'地址').replace(/task_id/g,'任务编号').replace(/API Key/gi,'接口密钥');
  if(/[\u3400-\u9fff]/.test(summary)&&!/[a-z]/i.test(summary))return summary;
  if(status>=500)return '生成服务暂时不可用，请检查模型设置或稍后重试。';
  if(status===422)return '输入或模型配置不正确，请检查后重试。';
  return '操作失败，请检查模型设置或稍后重试。';
}

const historyNames:Record<string,string>={...scoreNames,round:'轮次',before_score:'重写前评分',after_score:'重写后评分',rewrite_reason:'重写原因',score:'评分',reason:'说明',total:'总分',passed:'是否通过'};
export function chineseHistory(value:unknown):unknown{
  if(Array.isArray(value))return value.map(chineseHistory);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[historyNames[key]||key,chineseHistory(item)]));
  if(typeof value==='boolean')return value?'是':'否';
  return value;
}
