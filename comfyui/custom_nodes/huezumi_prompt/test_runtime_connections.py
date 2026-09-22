"""Private execution context tests; no GPU, provider or database calls."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).parent
package = types.ModuleType('runtime_test_package')
package.__path__ = [str(ROOT)]
sys.modules[package.__name__] = package

def load(name):
    spec = importlib.util.spec_from_file_location(f'{package.__name__}.{name}', ROOT / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module

runtime = load('runtime_connections')

class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_isolation_cleanup_and_private_registration(self):
        observed = {}
        class Executor:
            async def execute_async(self, prompt, prompt_id, extra_data, outputs):
                await asyncio.sleep(0)
                observed[prompt_id] = runtime.runtime_connections()
                if prompt_id == 'fail':
                    raise ValueError('fixture')
        execution = types.SimpleNamespace(SENSITIVE_EXTRA_DATA_KEYS=('existing',), PromptExecutor=Executor)
        server = types.SimpleNamespace(routes=Mock())
        runtime.install_runtime_connections(execution, server)
        runtime.install_runtime_connections(execution, server)
        self.assertEqual(execution.SENSITIVE_EXTRA_DATA_KEYS, ('existing', 'huezumi_connections'))
        self.assertEqual(server.routes.get.call_count, 1)
        await asyncio.gather(*[Executor().execute_async({}, name, {'huezumi_connections': {'agent': {'apiKey': name}}}, []) for name in ('a', 'b')])
        self.assertEqual(observed['a']['agent']['apiKey'], 'a')
        self.assertEqual(observed['b']['agent']['apiKey'], 'b')
        self.assertIsNone(runtime.runtime_connections())
        with self.assertRaises(ValueError):
            await Executor().execute_async({}, 'fail', {'huezumi_connections': {}}, [])
        self.assertIsNone(runtime.runtime_connections())

    async def test_old_executor_fails_closed(self):
        with self.assertRaises(RuntimeError):
            runtime.install_runtime_connections(types.SimpleNamespace(PromptExecutor=type('Old', (), {})), Mock())

    async def test_video_managed_context_never_uses_environment(self):
        with patch.dict(sys.modules, {'folder_paths': types.ModuleType('folder_paths')}):
            video = load('bailian_video')
        token = runtime._connections.set({'video': {'apiKey': 'managed', 'baseUrl': 'https://new.test/v1/'}})
        try:
            self.assertEqual(video._config(), ('managed', 'https://new.test/v1'))
        finally:
            runtime._connections.reset(token)
        token = runtime._connections.set({})
        try:
            with patch.dict('os.environ', {'HUEZUMI_DASHSCOPE_API_KEY': 'legacy', 'HUEZUMI_DASHSCOPE_WORKSPACE_ID': 'space'}):
                with self.assertRaises(RuntimeError):
                    video._config()
        finally:
            runtime._connections.reset(token)

    async def test_image_uses_assigned_endpoint_model_and_secret(self):
        from io import BytesIO
        import base64
        from PIL import Image
        api = load('api_image')
        content = BytesIO()
        Image.new('RGB', (2, 2)).save(content, format='PNG')
        response = Mock()
        response.json.return_value = {'data': [{'b64_json': base64.b64encode(content.getvalue()).decode()}]}
        token = runtime._connections.set({'image': {'baseUrl': 'https://images.test/v1', 'apiKey': 'private', 'defaultModel': 'assigned-model'}})
        try:
            with patch.object(api.requests, 'post', return_value=response) as post:
                output = api.HuezumiApiImage().generate('a tree', '1024x1024')
            self.assertEqual(tuple(output[0].shape), (1, 2, 2, 3))
            self.assertEqual(post.call_args.args[0], 'https://images.test/v1/images/generations')
            self.assertEqual(post.call_args.kwargs['json']['model'], 'assigned-model')
            self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer private')
            self.assertNotIn('private', json.dumps(api.HuezumiApiImage.INPUT_TYPES()))
        finally:
            runtime._connections.reset(token)

if __name__ == '__main__':
    unittest.main()
