"""Load RouterBench pickle with restricted unpickler — whitelists only
pandas/numpy/builtin types. If the pickle contains any other type, it errors
loudly instead of executing arbitrary code. Standard defensive pattern."""
import io
import pickle
import sys
from pathlib import Path

SAFE_MODULES = {
    "pandas": {"DataFrame", "Series", "Index", "RangeIndex", "Int64Index",
               "Float64Index", "MultiIndex", "_libs"},
    "pandas.core.frame": {"DataFrame"},
    "pandas.core.series": {"Series"},
    "pandas.core.indexes.base": {"Index", "_new_Index"},
    "pandas.core.indexes.range": {"RangeIndex"},
    "pandas.core.indexes.numeric": {"Int64Index", "Float64Index"},
    "pandas.core.indexes.multi": {"MultiIndex"},
    "pandas.core.internals.blocks": {"new_block"},
    "pandas.core.internals.managers": {"BlockManager", "SingleBlockManager"},
    "pandas._libs.internals": {"_unpickle_block"},
    "numpy": {"ndarray", "dtype"},
    "numpy.core.multiarray": {"_reconstruct", "scalar"},
    "numpy.core.numeric": {"_frombuffer"},
    "numpy.dtypes": {
        "Int8DType", "Int16DType", "Int32DType", "Int64DType",
        "UInt8DType", "UInt16DType", "UInt32DType", "UInt64DType",
        "Float16DType", "Float32DType", "Float64DType",
        "BoolDType", "ObjectDType", "BytesDType", "StrDType",
        "VoidDType",
    },
    "builtins": {"dict", "list", "tuple", "set", "frozenset", "str", "int",
                 "float", "bool", "bytes", "bytearray", "NoneType", "slice",
                 "range", "complex"},
    "collections": {"OrderedDict", "defaultdict"},
    "datetime": {"date", "datetime", "time", "timedelta", "timezone"},
}


class RestrictedUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        allowed = SAFE_MODULES.get(module, set())
        if name in allowed:
            return super().find_class(module, name)
        for mod_prefix, names in SAFE_MODULES.items():
            if module.startswith(mod_prefix + ".") and name in names:
                return super().find_class(module, name)
        raise pickle.UnpicklingError(
            f"BLOCKED: attempted to load {module}.{name} (not in allowlist)"
        )


def restricted_load(path: str | Path):
    with open(path, "rb") as f:
        return RestrictedUnpickler(f).load()


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if not path:
        print("usage: python load_routerbench.py <path_to_pkl>", file=sys.stderr)
        sys.exit(1)
    obj = restricted_load(path)
    print("type:", type(obj).__name__)
    try:
        print("shape:", obj.shape)
        print("columns:", list(obj.columns))
        print("dtypes:")
        print(obj.dtypes)
        print("--- head(2) ---")
        print(obj.head(2).to_string())
    except AttributeError:
        print("repr:", repr(obj)[:500])
