package com.qlu.dianfei;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 分享余额卡片用的只读文件出口（代替 androidx 的 FileProvider）：只认缓存目录 share/ 下的 png，
 * 不导出，别的应用只能凭分享时临时授予的读权限打开那一张图。授权名是「包名.share」，诊断包打包时自动改名。
 */
public class ShareProvider extends ContentProvider {
    static final String DIR = "share";

    static Uri uri(android.content.Context c, String name) {
        return Uri.parse("content://" + c.getPackageName() + ".share/" + name);
    }

    private File file(Uri u) throws FileNotFoundException {
        String name = u.getLastPathSegment();
        if (name == null || !name.matches("[a-z0-9-]+\\.png")) throw new FileNotFoundException();
        File f = new File(new File(getContext().getCacheDir(), DIR), name);
        if (!f.isFile()) throw new FileNotFoundException();
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri u) { return "image/png"; }

    @Override
    public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(file(u), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    // 微信等会先查文件名和大小
    @Override
    public Cursor query(Uri u, String[] projection, String sel, String[] args, String order) {
        File f;
        try { f = file(u); } catch (FileNotFoundException e) { return null; }
        String[] cols = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        MatrixCursor m = new MatrixCursor(cols, 1);
        m.addRow(row);
        return m;
    }

    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
